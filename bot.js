// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityTypes, MessageFactory } = require('botbuilder');

class MyBot {
    /**
     *
     * @param {TurnContext} on turn context object.
     */
    async onTurn(turnContext) {
        // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
        if (turnContext.activity.type === ActivityTypes.Message) {
            await turnContext.sendActivity(`You said '${ turnContext.activity.text }'`);
        } else if(turnContext.activity.type === ActivityTypes.ConversationUpdate) {
            const { membersAdded } = turnContext.activity;
            console.log(membersAdded)
            for (const { name } of membersAdded ) {
                console.log(name)
                if (name.toLowerCase().startsWith("agent")) {
                    const reply = MessageFactory.suggestedActions(["#list", "#connect"], "Welcome to the Human Handoff Middleware Example. You are currently communicating to the bot as an agent. To see a list of users waiting in the queue, message '#list' and to connect to the user at the top of the queue send '#connect.'")
                    await turnContext.sendActivity();
                } else if (name === 'User') {
                    const reply = MessageFactory.suggestedActions(["agent"], "Welcome to the Human Handoff Middleware Example. You are currently communicating to the bot as a user. To connect to agent, send 'agent.'")
                    await turnContext.sendActivity(reply);
                }
            }
        } else {
            await turnContext.sendActivity(`[${ turnContext.activity.type } event detected]`);
        }
    }
}

module.exports.MyBot = MyBot;
