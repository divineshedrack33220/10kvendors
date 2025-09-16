const Chat = require('../models/Chat');
const cloudinary = require('../config/cloudinary');

exports.createChat = async (req, res) => {
  try {
    let chat = await Chat.findOne({ user: req.user._id });
    if (!chat) {
      chat = new Chat({ user: req.user._id, messages: [] });
      chat.messages.push({
        sender: 'admin',
        content: 'Welcome to 10kVendor Support! How can we help you today?',
      });
      await chat.save();
    }
    res.json(chat);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const images = req.files?.map(file => ({
      url: file.path,
      public_id: file.filename,
    }));

    const chat = await Chat.findOne({ user: req.user._id });
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    if (content) {
      chat.messages.push({ sender: 'user', content });
    }
    if (images?.length) {
      images.forEach(image => chat.messages.push({ sender: 'user', image }));
    }

    await chat.save();

    // Simulate admin response
    setTimeout(async () => {
      chat.messages.push({
        sender: 'admin',
        content: content ? 'Thanks for your message! We’re checking on your query.' : `Thanks for sharing ${images.length > 1 ? 'the images' : 'the image'}! We’ll review and respond soon.`,
      });
      await chat.save();
    }, 1500);

    res.json(chat);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getChat = async (req, res) => {
  try {
    const chat = await Chat.findOne({ user: req.user._id });
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    res.json(chat);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};