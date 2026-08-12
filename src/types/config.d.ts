type AroxelpConfig = {
	token: string;
	masters: string[];
	modules: {
		ForwardedMessageManager: import("../modules/ForwardedMessageManager").default["config"];
		PatreonRoleSyncer: import("../modules/PatreonRoleSyncer").default["config"];
		Plexora: import("../modules/Plexora").default["config"];
		PolyTheParrot: import("../modules/PolyTheParrot").default["config"];
		RolePrison: import("../modules/RolePrison").default["config"];
		SimpleWhitelist: import("../modules/SimpleWhitelist").default["config"];
		SS13Database: import("../modules/SS13Database").default["config"];
		SS13PreferencesImporter: import("../modules/SS13PreferencesImporter").default["config"];
		SS14StatusRelay: import("../modules/SS14StatusRelay").default["config"];
		TicketChannelRenamer: import("../modules/TicketChannelRenamer").default["config"];
		// TwitchLiveNotification: import("../modules/TwitchLiveNotification").default["config"];
	};
};
