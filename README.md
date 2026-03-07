# Not-plexora

this is NOT plexora

# Modules

## ForwardedMessageManager

Mirrors messages from a source channel to a webhook, syncing all creations, edits, and deletions in real-time. Uses a local database to keep links alive across bot restarts.

## PolyTheParrot

Pickes entries from the specified poly file in the config, and sends them to the webhook specified in the config

## TicketChannelRenamer

Renames newly created channels by TicketsBot, based on the text in the "Server" field of the embed, which is ran through the matchers specified in the config.

### Example

config.json

```json
{
	"TicketChannelRenamer": [
		{
			"embedfind": {
				"field": "Server",
				"find": "monke|monkestation|mrp"
			},
			"append": "monke"
		}
	]
}
```

Channel created with name `ticket-1234`
Message with embed:

```json
{
	"embeds": [
		{
			"id": "embed_364",
			"type": "rich",
			"rawDescription": "Thank you for contacting support.\nPlease describe your issue and wait for a response.",
			"contentScanVersion": 4,
			"color": "hsla(145, calc(var(--saturation-factor, 1) * 63.2%), 49%, 1)",
			"fields": []
		},
		{
			"id": "embed_365",
			"type": "rich",
			"contentScanVersion": 4,
			"color": "hsla(145, calc(var(--saturation-factor, 1) * 63.2%), 49%, 1)",
			"fields": [
				{
					"rawName": "Admin/Player in question",
					"rawValue": "Example",
					"inline": false
				},
				{
					"rawName": "Report Information",
					"rawValue": "Example!!",
					"inline": false
				},
				{
					"rawName": "Server",
					"rawValue": "Monke",
					"inline": false
				}
			]
		}
	]
}
```

Matcher goes through each embeds fields, matches name against config entries, and then appends `monke` to the ticket name, resulting in `ticket-1234-monke`

## SS13PreferencesImporter

Tickets-like bot based SS13 (TG-style) preferences importer (Relies on Plexora)

Config example:

```jsonc
    "SS13PreferencesImporter": {
      "MissingLinkMessage": "You do not have a linked ckey. Please follow the instructions in <#1476801734490984633>",
      "TicketCategoryChannelID": "1476803413235994847",
      "PlayerDataFolder": "/mnt/endymion/ss13/oculis/Configuration/GameStaticFiles/data/player_saves",
      "PlexoraServerID": "12345678",
      "AdminRoleIDs": [
        "1460046049325482177", // Headmin
        "1460076456339312834", // Advisor
        "1460045862066716763", // Sysadmin
        "1460045068483301529" // Admin,
      ]
    },
```

## SimpleWhitelist

Tickets-like bot based whitelist approval bot that just gives you a role when an admin approves it

Config example:

```jsonc
"SimpleWhitelist": {
	"TicketCategoryChannelID": "1460130729466789958",
	"AdminRoleIDs": [
		"1460046049325482177", // Headmin
		"1460076456339312834", // Advisor
		"1460045862066716763", // Sysadmin
		"1460045068483301529" // Admin,
	],
	"WhitelistedRoleID": "1460043766768468176",
	"CreationChannelID": "1460130865551249469",
	"ChannelCheckIgnoreIDs": [
		"1460045068483301529" // Admin,
	]
},
```
