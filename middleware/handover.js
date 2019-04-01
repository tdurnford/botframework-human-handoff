const { ActivityTypes, TurnContext, BotFrameworkAdapter } = require('botbuilder');

const UserState = {
  Bot: 'BOT',
  Queued: 'QUEUED',
  Agent: 'AGENT'
}

class HandoverMiddleware {

  /**
   * 
   * @param {ArrayHandoverProvider} provider 
   * @param {BotFrameworkAdapter} adapter 
   */
  constructor(provider, adapter) {
    this.provider = provider;
    this.adapter = adapter;
  }

  /**
   * 
   * @param {TurnContext} turnContext 
   * @param {*} next 
   */
  async onTurn(turnContext, next) {
    
    if (turnContext.activity.type !== ActivityTypes.Message) { return await next(); }
    
    if (turnContext.activity.from.name.toLowerCase().startsWith("agent")) {
      await this.manageAgent(turnContext, next);
    } else {
      await this.manageUser(turnContext, next);
    }    
  }

  /**
   * 
   * @param {ArrayHandoverProvider} turnContext
   * @param {*} next 
   */
  async manageUser(turnContext, next) {
    const conversationReference = TurnContext.getConversationReference(turnContext.activity);
    const user = await this.provider.findOrCreate(conversationReference);
    // await this.provider.log((user, conversationReference.user.name, turnContext.activity.text));

    const { activity: { text }} = turnContext;

    if (user.state === UserState.Agent) {
      return await this.adapter.continueConversation(user.agentReference, async agentContext => {
        await agentContext.sendActivity(turnContext.activity.text);
      });
    }

    switch(text.toLowerCase()) {
      case "agent":
        await this.provider.queueForAgent(conversationReference);
        await turnContext.sendActivity("Please wait while we try to connect you to an agent.")
        break;
      case "cancel":
        await this.provider.unqueueForAgent(conversationReference);
        await turnContext.sendActivity("You are now reconnected to the bot!");
        break;
      default:
        return await next();
    }
  }

  /**
   * 
   * @param {TurnConext} turnContext 
   * @param {*} next 
   */
  async manageAgent(turnContext, next) {
    
    const conversationReference = TurnContext.getConversationReference(turnContext.activity);
    const user = await this.provider.findByAgent(conversationReference);
    const { activity: { text }} = turnContext;

    if (user) {
      if (text === "#disconnect") {
        this.provider.disconnectFromAgent(conversationReference);
        await turnContext.sendActivity("You have been disconnected from the user.");
        await this.adapter.continueConversation(user.userReference, async userContext => {
          await userContext.sendActivity("The agent disconnected from the conversation. You are now reconnected to the bot.")
        });
        return
      } else if (text.indexOf("#") === 0) {
        await turnContext.sendActivity("Command not valid when connect to user");
        return
      } else {
        // await this.provider.log(user, conversationReference.user.name);
        return this.adapter.continueConversation(user.userReference, async turnContext => {
          await turnContext.sendActivity(text);
        });
      }
    }

    switch (text) {
      case "#list":
        const queue = this.provider.getQueue();
        if (queue.length !== 0) {
          const message = queue.map(user => user.userReference.user.name).join('\n');
          await turnContext.sendActivity("Users:\n\n" + message);
        } else {
          await turnContext.sendActivity("There are no users in the Queue right now.");
        }
        break;
      case "#connect": 
        const user = await this.provider.connectToAgent(conversationReference);
        if (user) {
          await turnContext.sendActivity(`You are connected to ${user.userReference.user.name}`);
          await this.adapter.continueConversation(user.userReference, async userContext => {
            await userContext.sendActivity("You are now connected to an agent!");
          })
        } else {
          await turnContext.sendActivity("There are no users in the Queue right now.");
        }
    }
  }
}

class ArrayHandoverProvider {

  constructor(backingStore=[]) {
    this.backingStore = backingStore;
  }

  async findOrCreate(userReference) {
    let result = this.backingStore.find(u => u.userReference.user.id === userReference.user.id);

    if (result) {
      return result
    }

    result = {
      userReference,
      state: UserState.Bot,
      messages: []
    }

    this.backingStore.push(result);
    return result;
  }

  async log(user, from, text) {
    user.messages.push({ from, text});
    console.log(this.backingStore)
    return user;
  }

  async findByAgent(agentReference) {
    const result = this.backingStore.find(u => u.agentReference && u.agentReference.user.id === agentReference.user.id);
    return result? result: null;
  }

  async queueForAgent(userReference) {
    const user = await this.findOrCreate(userReference);
    user.state = UserState.Queued;
    user.queueTime = new Date();
    return user;
  }

  async unqueueForAgent(userReference) {
    const user = await this.findOrCreate(userReference);
    user.state = UserState.Bot;
    user.queueTime = null;
    return user;
  }

  async connectToAgent(agentReference) {
    const queue = this.getQueue();
    if (queue.length > 0) {
      const user = queue[0];
      user.state = UserState.Agent;
      user.queueTime = null;
      user.agentReference = agentReference;
      return user;
    } 
  }

  async disconnectFromAgent(agentReference) {
    const user = await this.findByAgent(agentReference);
    user.state = UserState.Bot;
    user.agentContext = null;
    user.queueTime = null;
    return user;
  }

  getQueue() {
    return this.backingStore
      .filter(u => u.state === UserState.Queued)
      .sort(u => u.queueTime.getTime());
  }
}

module.exports.ArrayHandoverProvider = ArrayHandoverProvider;
module.exports.HandoverMiddleware = HandoverMiddleware;