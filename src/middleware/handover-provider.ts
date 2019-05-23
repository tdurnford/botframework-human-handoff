import { ConversationReference, Activity } from 'botbuilder';
import { runInThisContext } from 'vm';

export enum UserState {
  Bot,
  Agent,
  Queued
}

export interface User {
  userReference: Partial<ConversationReference>;
  messages: Activity[];
  state: UserState;
  agentReference?: Partial<ConversationReference>;
  queueTime?: Date;
}

export interface HandoverProvider {
  findOrCreate(userReference: Partial<ConversationReference>): Promise<User>;
  findByAgent(agentReference: Partial<ConversationReference>): Promise<User>;

  save(user: User): Promise<void>;
  log(user: User, activity: Activity): Promise<User>;

  queueForAgent(userReference: Partial<ConversationReference>): Promise<User>;
  dequeueForAgent(userReference: Partial<ConversationReference>): Promise<User>;
  connectToAgent(userReference: Partial<ConversationReference>): Promise<User>;
  disconnectFromAgent(userReference: Partial<ConversationReference>): Promise<User>;
  getQueue(): Promise<User[]>;
}

export class ArrayHandoverProvider implements HandoverProvider {

  private backingStore: User[];

  constructor(backingStore: User[] = []) {
    this.backingStore = backingStore;
  }

  public async findOrCreate(userReference: Partial<ConversationReference>): Promise<User> {
    const user = this.backingStore.find(u => u.userReference.conversation.id === userReference.conversation.id);
    if (user) { return user; }
    const newUser = {
      userReference,
      state: UserState.Bot,
      messages: []
    }
    this.backingStore.push(newUser);
    console.log(this.backingStore)
    return newUser;
  }

  public async findByAgent(agentReference: Partial<ConversationReference>): Promise<User> {
    const user = this.backingStore.find(u => u.agentReference && u.agentReference.conversation.id === agentReference.conversation.id);
    return user;
  }

  public async log(user: User, activity: Activity): Promise<User> {
    user.messages.push(activity);
    return user;
  }

  public async queueForAgent(userReference: Partial<ConversationReference>): Promise<User> {
    const user = await this.findOrCreate(userReference);
    user.state = UserState.Queued;
    user.queueTime = new Date();
    return user;
  }

  public async dequeueForAgent(userReference: Partial<ConversationReference>): Promise<User> {
    const user = await this.findOrCreate(userReference);
    user.state = UserState.Bot;
    user.queueTime = null;
    return user;
  }

  public async connectToAgent(agentReference: Partial<ConversationReference>): Promise<User> {
    const queue = await this.getQueue();
    if (queue.length > 0) {
      const user = queue[0];
      user.queueTime = null;
      user.state = UserState.Agent;
      user.agentReference = agentReference;
      return user;
    }
  }

  public async disconnectFromAgent(agentReference: Partial<ConversationReference>): Promise<User> {
    const user = await this.findByAgent(agentReference);
    user.state = UserState.Bot;
    user.queueTime = null;
    user.agentReference = null;
    return user;    
  }

  public async save() {
    // Do not need to save changes to array
  }

  public async getQueue() {
    return this.backingStore
      .filter((u: User) => u.state === UserState.Queued)
      .sort((u: User) => u.queueTime.getTime());
  }
}
