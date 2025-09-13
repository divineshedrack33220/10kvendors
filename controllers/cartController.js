const Cart = require('../models/Cart');
const Product = require('../models/Product');

exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId || quantity < 1) {
      return res.status(400).json({ message: 'Invalid product or quantity' });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
    if (itemIndex > -1) {
      cart.items[itemIndex].quantity = quantity;
    } else {
      cart.items.push({ product: productId, quantity });
    }

    await cart.save();
    await cart.populate('items.product');
    res.json(cart);
  } catch (error) {
    console.error('Error in addToCart:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ message: 'Product ID required' });

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    cart.items = cart.items.filter(item => item.product.toString() !== productId);
    await cart.save();
    await cart.populate('items.product');
    res.json(cart);
  } catch (error) {
    console.error('Error in removeFromCart:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    if (!cart) {
      return res.json({ user: req.user._id, items: [] });
    }
    res.json(cart);
  } catch (error) {
    console.error('Error in getCart:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAllCarts = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
    const carts = await Cart.find().populate('items.product user');
    res.json(carts);
  } catch (error) {
    console.error('Error in getAllCarts:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.mergeCart = async (req, res) => {
  try {
    const { cart } = req.body;
    if (!Array.isArray(cart)) return res.status(400).json({ message: 'Invalid cart data' });

    let userCart = await Cart.findOne({ user: req.user._id });
    if (!userCart) {
      userCart = new Cart({ user: req.user._id, items: [] });
    }

    for (const item of cart) {
      const { productId, quantity } = item;
      if (!productId || quantity < 1) continue;

      const product = await Product.findById(productId);
      if (product) {
        const existingItem = userCart.items.find(cartItem => cartItem.product.toString() === productId);
        if (existingItem) {
          existingItem.quantity += quantity;
        } else {
          userCart.items.push({ product: productId, quantity });
        }
      }
    }

    await userCart.save();
    await userCart.populate('items.product');
    res.json({ message: 'Cart merged successfully', cart: userCart });
  } catch (error) {
    console.error('Error in mergeCart:', error);
    res.status(500).json({ message: error.message });
  }
};