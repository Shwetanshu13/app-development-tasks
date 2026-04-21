// Create me a chat room that can handle text message exchange for two users.

// refactor the code such that the two users are passed individually instead of together.

class ChatRoom {
    // constructor(user1, user2) {
    //     this.user1 = user1;
    //     this.user2 = user2;
    //     this.messages = [];
    // }

    constructor(user) {
        if (!this.user1) {
            this.user1 = user;
        } else if (!this.user2) {
            this.user2 = user;
        } else {
            throw new Error("Chat room already has two users.");
        }
    }
}

ChatRoom.prototype.sendMessage = function (sender, message) {
    if (sender !== this.user1 && sender !== this.user2) {
        throw new Error("Sender must be one of the chat room users.");
    }
    this.messages.push({ sender, message });
}

ChatRoom.prototype.getMessages = function () {
    return this.messages;
}

export default ChatRoom;

// Example usage:
// const chatRoom = new ChatRoom("Alice", "Bob");
// chatRoom.sendMessage("Alice", "Hello, Bob!");
// chatRoom.sendMessage("Bob", "Hi, Alice! How are you?");
// console.log(chatRoom.getMessages());