import { ActionTypes, ActivityTypes, TurnContext, BotFrameworkAdapter } from 'botbuilder';
import { HandoverProvider, UserState, User } from './handover-provider';

export const AGENT_ACTION = { type: ActionTypes.ImBack, title: 'Agent', value: 'agent' }
export const CANCEL_ACTION = { type: ActionTypes.ImBack, title: 'Cancel', value: 'cancel' }
export const CONNECT_ACTION = { type: ActionTypes.ImBack, title: 'Connect', value: '#connect' };
export const DISCONNECT_ACTION = { type: ActionTypes.ImBack, title: 'Disconnect', value: '#disconnect' };
export const LIST_ACTION = { type: ActionTypes.ImBack, title: 'List', value: '#list' };

export class HandoverMiddleware {

  constructor(private provider: HandoverProvider, private adapter: BotFrameworkAdapter) {
  }

  public async onTurn(turnContext: TurnContext, next: () => Promise<void>) {

    if (turnContext.activity.type === ActivityTypes.Message || turnContext.activity.type === ActivityTypes.Typing) {

      if (turnContext.activity.from.id.startsWith('dl_agent')) {
        await this.handleAgent(turnContext, next);
      } else {
        await this.handleUser(turnContext, next);
      }
    } else {
      await next();
    }    
  }

  public async handleAgent(turnContext: TurnContext, next: () => Promise<void>) {
    const conversationReference = TurnContext.getConversationReference(turnContext.activity);
    const { text, type } = turnContext.activity;
    const user = await this.provider.findByAgent(conversationReference);
    if (!user && text && text.indexOf('#') !== 0) { return next(); }

    if (user) {
      if (text === '#disconnect') {
        await this.provider.disconnectFromAgent(conversationReference);
        await turnContext.sendActivity({ text: 'You are disconnect from the user', channelData: { status: 'disconnected' }, suggestedActions: { actions: [LIST_ACTION, CONNECT_ACTION], to: undefined }});
        this.adapter.continueConversation(user.userReference, async context => {
          await context.sendActivity({text: 'The agent has disconnected. You are now reconnected with the bot.', channelData: { status: 'bot' }, suggestedActions: { actions: [AGENT_ACTION], to: undefined }})
        });
        return
      } else if (text && text.indexOf('#') === 0) {
        await turnContext.sendActivity('Command not valid when connected to user.');
        return
      } else {
        this.provider.log(user, turnContext.activity);
        return this.adapter.continueConversation(user.userReference, async turnContext => {
          await turnContext.sendActivity({ text, type });
        });
      }
    }

    switch(text) {
      case '#list':
        const queue = await this.provider.getQueue();
        
        if (queue.length) {
          const list = queue.map((user: User) =>  user.userReference.user.name).join('\n');
          await turnContext.sendActivity({ text: `Users in queue: \n${list}`, suggestedActions: { actions: [LIST_ACTION, CONNECT_ACTION], to: undefined }});
        } else {
          await turnContext.sendActivity({ text: 'There is no one currently in the queue.', suggestedActions: { actions: [LIST_ACTION, CONNECT_ACTION], to: undefined }});
        }
        break;
      case '#connect':
        const user = await this.provider.connectToAgent(conversationReference);
        if (user) {
          await turnContext.sendActivity({ text: `You are now connected to ${user.userReference.user.name}.`, channelData: { status: 'connected'}, suggestedActions: { actions: [DISCONNECT_ACTION], to: undefined }});
          this.adapter.continueConversation(user.userReference, async context => {
            await context.sendActivity({text: 'You are now connected to an agent', channelData: { status: 'agent' }})
          });
        } else {
          await turnContext.sendActivity({ text: 'There is no one currently in the queue.', suggestedActions: { actions: [LIST_ACTION, CONNECT_ACTION], to: undefined }});
        }
    }
  }

  public async handleUser(turnContext: TurnContext, next: () => Promise<void>) {
    const conversationReference = TurnContext.getConversationReference(turnContext.activity);
    const user = await this.provider.findOrCreate(conversationReference);
    this.provider.log(user, turnContext.activity);

    const { text, type } = turnContext.activity;

    if (user.state === UserState.Agent) {
      return this.adapter.continueConversation(user.agentReference, async turnContext => {
        await turnContext.sendActivity({ text, type, suggestedActions: { actions: [DISCONNECT_ACTION], to: undefined } });
      });
    }

    if (!text) { return }
    switch (text.toLocaleLowerCase()) {
      case('agent'):
        await this.provider.queueForAgent(conversationReference);
        await turnContext.sendActivity({ text: 'Hold on while we connect you to an agent.', channelData: { status: 'waiting'}, suggestedActions: { actions: [CANCEL_ACTION], to: undefined }});
        break;
      case('cancel'):
        await this.provider.dequeueForAgent(conversationReference);
        await turnContext.sendActivity({ text: 'You are now reconnected to the bot.', channelData: { status: 'bot'} , suggestedActions: { actions: [AGENT_ACTION], to: undefined }});
        break;
      default:
        await next();
    }
  }
}
