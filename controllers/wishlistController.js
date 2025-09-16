const Wishlist = require('../models/Wishlist');
const Cart = require('../models/Cart');
const mongoose = require('mongoose');

exports.getWishlist = async (req, res) => {
  try {
    console.log('Fetching wishlist for user:', req.user._id);
    const wishlist = await Wishlist.find({ user: req.user._id }).select('product');
    const productIds = wishlist.map(item => item.product.toString());
    res.json(productIds);
  } catch (error) {
    console.error('Error in getWishlist:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      console.log('Invalid product ID:', productId);
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const existingItem = await Wishlist.findOne({ user: req.user._id, product: productId });
    let action;

    if (existingItem) {
      await Wishlist.findOneAndDelete({ user: req.user._id, product: productId });
      action = 'removed';
      console.log('Product removed from wishlist:', productId);
    } else {
      const wishlistItem = new Wishlist({
        user: req.user._id,
        product: productId
      });
      await wishlistItem.save();
      action = 'added';
      console.log('Product added to wishlist:', productId);
    }

    res.json({ action });
  } catch (error) {
    console.error('Error in toggleWishlist:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.addToCartFromWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      console.log('Invalid product ID:', productId);
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    const existingItem = cart.items.find(item => item.product.toString() === productId);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.items.push({ product: productId, quantity: 1 });
    }

    await cart.save();
    await Wishlist.findOneAndDelete({ user: req.user._id, product: productId });
    console.log('Product moved from wishlist to cart:', productId);
    res.json(cart);
  } catch (error) {
    console.error('Error in addToCartFromWishlist:', error);
    res.status(400).json({ message: error.message });
  }
};
