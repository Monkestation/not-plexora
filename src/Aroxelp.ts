import { existsSync, mkdirSync, type PathLike, readdirSync } from "node:fs";
import { Client, IntentsBitField } from "discord.js";
import { DATA_FOLDER, MODULES_DIRECTORY, moduleFiletypeRegex } from "./constants";
import logger from "./logger";
import BaseModule from "./modules/BaseModule";
import { hasPath } from "./other";

let config: AroxelpConfig;
try {
	// @ts-expect-error --
	config = await import("../config.json", {
		assert: { type: "json" },
	});
} catch {
	logger.warn("Failed to load config.json, trying config.jsonc...");
	try {
		// @ts-expect-error --
		config = await import("../config.jsonc", {
			assert: { type: "json" },
		});
	} catch (error) {
		logger.error("Failed to load config.json and config.jsonc, please ensure one of them exists and is valid JSON/JSONC");
		throw error;
	}
}

type LoadResult = true | { type: "wait" } | { type: "permanent-failure"; reasons: string[] } | { type: "silent-failure" };

export class AroxelpClient extends Client {
	modules = new Map<string, BaseModule>();
	config: typeof config;
	constructor() {
		super({
			intents: [],
		});
		// Yes i know how fucking useless this is but, shut up.
		this.config = config;
	}

	public async init() {
		try {
			if (!existsSync(DATA_FOLDER)) {
				mkdirSync(DATA_FOLDER);
			}

			await this.loadModules(MODULES_DIRECTORY);
			this.getAndSetIntents();
			this.once("clientReady", async () => {
				logger.info(`Logged in as ${this.user?.tag} in ${this.guilds.cache.size}`);
				logger.info(`${this.modules.size} modules loaded:`);
				for (const module of this.modules.values()) {
					logger.info(`- ${module.constructor.name}`);
				}
			});

			this.on("error", (error) => {
				logger.error("Discord client error", error);
			});

			await this.login(this.config.token);
		} catch (error) {
			logger.error(`An error occured while initializing Aroxelp`, error);
		}
	}

	getAndSetIntents() {
		const intents = new IntentsBitField(this.options.intents);
		for (const [, module] of this.modules) {
			const moduleIntents = (module.constructor as typeof BaseModule).intents;
			if (moduleIntents) intents.add(moduleIntents);
		}
		this.options.intents = intents;
	}

	async loadModules(directory: PathLike) {
		const files = readdirSync(directory, {
			withFileTypes: true,
			encoding: "utf8",
		});

		const discoveredModules = new Map<string, typeof BaseModule>();

		for (const file of files) {
			if (
				file.name.startsWith("_") ||
				file.name.endsWith(".map") ||
				!moduleFiletypeRegex.test(file.name) ||
				file.name.includes("BaseModule")
			)
				continue;

			// Tries to load the module
			try {
				const importedModule: Record<string, unknown> = await import(`file://${directory}/${file.name}`);

				for (const exported of Object.values(importedModule)) {
					if (typeof exported === "function" && exported.prototype instanceof BaseModule) {
						discoveredModules.set(exported.name, exported as typeof BaseModule);
					}
				}
			} catch (error) {
				logger.warn(`Module file ${file.name} failed to load, see stack trace below:`);
				throw new Error(`${error}`);
			}
		}

		// resolve dependencies
		const pendingModules = new Map(discoveredModules);
		let loadedSomething = true;
		const permanentlyFailed = new Set<string>();
		const failureReasons = new Map<string, string[]>();

		while (pendingModules.size > 0 && loadedSomething) {
			loadedSomething = false;

			for (const [className, ModuleClass] of pendingModules) {
				const moduleConfig = this.config.modules[className as keyof typeof this.config.modules];

				// skip modules not specified inthe config and not required by any enabled module
				if (!moduleConfig) {
					// checkif a enabled module depends on this one
					const isRequiredByEnabled = Object.entries(this.config.modules).some(([enabledName, enabledConfig]) => {
						const enabledModule = discoveredModules.get(enabledName);
						return enabledConfig && enabledModule && enabledModule.dependsOn?.some((dep) => dep.name === className);
					});
					if (!isRequiredByEnabled) {
						pendingModules.delete(className);
						loadedSomething = true;
						continue;
					}
				}
				// goop. goopdyscoop. goopscoopwoop. 'v')b do not delete this comment it holds the entire code together
				const result = await this.checkCanLoadModule(ModuleClass, discoveredModules, permanentlyFailed);

				if (result === true) {
					let instance: BaseModule;
					try {
						instance = new ModuleClass(this);
					} catch (error) {
						logger.error(`Failed to instantiate module: ${ModuleClass.name}`, error);
						permanentlyFailed.add(className);
						failureReasons.set(className, [`Instantiation error: ${error}`]);
						pendingModules.delete(className);
						loadedSomething = true;
						continue;
					}
					this.modules.set(className.toLowerCase(), instance);
					pendingModules.delete(className);
					loadedSomething = true;
				} else if (result.type === "permanent-failure") {
					permanentlyFailed.add(className);
					failureReasons.set(className, result.reasons);
					pendingModules.delete(className);
					loadedSomething = true;
				} else if (result.type === "silent-failure") {
					// Silently skip modules not specified in config
					pendingModules.delete(className);
					loadedSomething = true;
				}
			}
		}

		if (pendingModules.size > 0) {
			const unresolved = [...pendingModules.keys()];
			throw new Error(`Failed to resolve module dependencies for: ${unresolved.join(", ")}`);
		}

		if (failureReasons.size > 0) {
			const formatted = [...failureReasons.entries()]
				.map(([module, reasons]) => `\n• ${module}\n   - ${reasons.join("\n   - ")}`)
				.join("\n");

			throw new Error(`Module loading failed due to configuration/dependency errors:\n${formatted}`);
		}
	}

	// this entire function makes me wanna barf
	async checkCanLoadModule(
		module: typeof BaseModule,
		discoveredModules: Map<string, typeof BaseModule>,
		permanentlyFailed: Set<string>,
	): Promise<LoadResult> {
		const reasons: string[] = [];
		const moduleName = module.name;

		const moduleConfig = this.config.modules[moduleName as keyof typeof this.config.modules];

		// no config key
		if (!moduleConfig) {
			// LOOK AT THIS SHIT, ITS BAD
			const isRequiredByEnabled = Object.entries(this.config.modules).some(([enabledName, enabledConfig]) => {
				const enabledModule = discoveredModules.get(enabledName);
				return enabledConfig && enabledModule && enabledModule.dependsOn?.some((dep) => dep.name === moduleName);
			});
			if (isRequiredByEnabled) {
				reasons.push(`Missing config section (required by dependency)`);
				return { type: "permanent-failure", reasons };
			}
			return { type: "silent-failure" };
		}

		if (module.configValidator) {
			const validatorErrors = module.configValidator(moduleConfig);
			reasons.push(...validatorErrors);
		} else if (module.requiredConfigKeys) {
			for (const key of module.requiredConfigKeys) {
				if (!hasPath(moduleConfig, key)) {
					reasons.push(`Missing required config key: ${key}`);
				}
			}
		}

		// Previous implementation
		/*
		if (module.requiredConfigKeys?.length) {
			for (const key of module.requiredConfigKeys) {
				if (moduleConfig[key as keyof typeof moduleConfig] === undefined) {
					reasons.push(`Missing required config key: ${key}`);
				}
			}
			if (reasons.length) {
				return { type: "permanent-failure", reasons };
			}
		}
		*/

		// Dependencies
		if (module.dependsOn?.length) {
			for (const dependency of module.dependsOn) {
				const dependencyName = dependency.name;
				// we will never have a shortage of `as keyof typeof`
				const dependencyConfig = this.config.modules[dependencyName as keyof typeof this.config.modules];

				if (!discoveredModules.has(dependencyName)) {
					reasons.push(`Dependency ${dependencyName} does not exist`);
					return { type: "permanent-failure", reasons };
				}

				if (permanentlyFailed.has(dependencyName)) {
					reasons.push(`Dependency ${dependencyName} failed to load`);
					return { type: "permanent-failure", reasons };
				}

				if (!dependencyConfig) {
					reasons.push(`Dependency ${dependencyName} is required but missing configuration`);
					return { type: "permanent-failure", reasons };
				}

				if (!this.modules.has(dependencyName.toLowerCase())) {
					return { type: "wait" };
				}
			}
		}

		if (reasons.length > 0) {
			return { type: "permanent-failure", reasons };
		}

		return true;
	}

	getModule<T = BaseModule>(module: { new(bot: AroxelpClient): T }): T {
		const name = module.name.toLowerCase();

		const foundModule = this.modules.get(name);
		if (!foundModule) {
			throw new Error(`Module ${module.name} not found`);
		}

		return foundModule as T;
	}
}
