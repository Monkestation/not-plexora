import "./prototypes.js";
import { AroxelpClient } from "./Aroxelp.js";
import logger from "./logger.js";

const client = new AroxelpClient();
client.init();

process.on("unhandledRejection", (error) => {
	logger.error("Unhandled promise rejection", error);
});

process.on("uncaughtException", (error) => {
	logger.error(error);
});

// @ts-expect-error it exists.
Error.stackTraceLimit = 50;
