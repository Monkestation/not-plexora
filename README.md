# Not-plexora

this is NOT plexora

# Modules

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
  ],
}
```

Matcher goes through each embeds fields, matches name against config entries, and then appends `monke` to the ticket name, resulting in `ticket-1234-monke`