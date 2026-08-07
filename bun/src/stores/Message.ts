import { defineStore } from "pinia";

export const useMessageStore = defineStore("messages", {
  state: () => ({
    messages: [] as string[],
  }),

  getters: {
    getMessages(state) {
      return state.messages;
    },
  },

  actions: {
    addMessages(message: string) {
      this.messages.push(message)
      return ;
    },
  },
});
