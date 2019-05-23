// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import axios from 'axios';
import { ActivityHandler, ActionTypes, MessageFactory } from 'botbuilder';
import { AGENT_ACTION, CONNECT_ACTION, LIST_ACTION } from './middleware/handover-middleware';

const FACEBOOK_HANDOVER_ACTION = { type: ActionTypes.ImBack, title: 'Facebook Handover', value: 'facebook handover' }

export class MyBot extends ActivityHandler {
    
    constructor() {
        super();

        this.onMessage(async (context, next) => {

            const { text, from, channelId } = context.activity;

            if (from.id && !from.id.startsWith('dl_agent')) {
                if (text.toLocaleLowerCase() === 'facebook handover') {
                    await this.facebookHandover(context);
                } else {
                    const actions = [AGENT_ACTION];
                    channelId === 'facebook' && actions.push(FACEBOOK_HANDOVER_ACTION)
                    const reply = MessageFactory.suggestedActions(actions, `You said '${ context.activity.text }'`);
                    await context.sendActivity(reply);
                }
            } 
            await next();
        });

        this.onEvent(async (context, next) => {

            const { activity: { name }} = context;

            if (name) {
                if (name === 'agent/join') {
                    const reply = MessageFactory.suggestedActions([LIST_ACTION, CONNECT_ACTION], "Welcome to the Human Handoff Middleware Example. You are currently communicating to the bot as an Agent. To see a list of users waiting in the queue, message '#list' and to connect to the user at the top of the queue send '#connect.'")
                    await context.sendActivity(reply);
                } else {
                    const reply = MessageFactory.suggestedActions([AGENT_ACTION], "Welcome to the Human Handoff Middleware Example. You are currently communicating to the bot as a User. To connect to agent, send 'agent.'")
                    await context.sendActivity(reply);
                }
            }

            await next();
        });
    }

    async facebookHandover(turnContext) {

        await axios.post(`https://graph.facebook.com/v2.6/me/pass_thread_control?access_token=${process.env.FACEBOOK_TOKEN}`, {
          recipient: {id: turnContext.activity.from.id}, // conversation id
          target_app_id: 263902037430900, // page inbox app id
          metadata: "Handoff" // String to pass to secondary receiver app
        });
  
        await turnContext.sendActivity(`You've been handed over to an agent`)
      }
}
