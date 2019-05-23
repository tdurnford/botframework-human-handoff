import { ActivityTypes, TurnContext, BotFrameworkAdapter } from 'botbuilder';
import { HandoverProvider, UserState, User } from './handover-provider';
import { access } from 'fs';
import { Activity } from 'botframework-connector/lib/connectorApi/models/mappers';

export class HandoverMiddleware {

  constructor(private provider: HandoverProvider, private adapter: BotFrameworkAdapter) {

  }

  public async onTurn(turnContext: TurnContext, next: () => Promise<void>) {
    if (turnContext.activity.type === ActivityTypes.Message) {

      if (turnContext.activity.from.id.startsWith('agent')) {
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
    const { text } = turnContext.activity;
    const user = await this.provider.findByAgent(conversationReference);
    if (!user && text.indexOf('#') !== 0) { return next(); }

    if (user) {
      if (text === '#disconnect') {
        await this.provider.disconnectFromAgent(conversationReference);
        await turnContext.sendActivity('You are disconnect from the user');
        return
      } else if (text.indexOf('#') === 0) {
        await turnContext.sendActivity('Command not valid when connected to user.');
        return
      } else {
        this.provider.log(user, turnContext.activity);
        return this.adapter.continueConversation(user.userReference, async turnContext => {
          await turnContext.sendActivity(text);
        });
      }
    }

    switch(text) {
      case '#list':
        const queue = await this.provider.getQueue();
        const list = queue.map((user: User) =>  user.userReference.user.name).join('\n');
        await turnContext.sendActivity(`Users in queue: \n${list}`);
        break;
      case '#connect':
        const user = await this.provider.connectToAgent(conversationReference);
        if (user) {
          await turnContext.sendActivity(`You are now connected to ${user.userReference.user.name}.`);
        } else {
          await turnContext.sendActivity('There is now one currently in the queue.');
        }
    }
  }

  public async handleUser(turnContext: TurnContext, next: () => Promise<void>) {
    const conversationReference = TurnContext.getConversationReference(turnContext.activity);
    const user = await this.provider.findOrCreate(conversationReference);
    this.provider.log(user, turnContext.activity);

    const { text } = turnContext.activity;

    if (user.state === UserState.Agent) {
      return this.adapter.continueConversation(user.agentReference, async turnContext => {
        await turnContext.sendActivity(text);
      });
    }

    switch (text.toLocaleLowerCase()) {
      case('agent'):
        await turnContext.sendActivity('Hold on while we connect you to an agent.');
        await this.provider.connectToAgent(conversationReference);
        break;
      case('cancel'):
        await turnContext.sendActivity('You are now reconnected to the bot.');
        await this.provider.dequeueForAgent(conversationReference);
        break;
      default:
        await next();
    }
  }
}