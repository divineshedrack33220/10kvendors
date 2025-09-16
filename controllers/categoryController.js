// controllers/categoryController.js
const Category = require('../models/Category');
const Product = require('../models/Product');

exports.createCategory = async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name || !icon) return res.status(400).json({ message: 'Name and icon are required' });
    const category = new Category({ name, icon, itemCount: 0 });
    await category.save();
    req.app.get('io').to('adminRoom').emit('categoryUpdate');
    res.status(201).json(category);
  } catch (error) {
    console.error('Error in createCategory:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().select('name icon itemCount');
    res.json(categories);
  } catch (error) {
    console.error('Error in getCategories:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name || !icon) return res.status(400).json({ message: 'Name and icon are required' });
    const category = await Category.findByIdAndUpdate(req.params.id, { name, icon }, { new: true });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    req.app.get('io').to('adminRoom').emit('categoryUpdate');
    res.json(category);
  } catch (error) {
    console.error('Error in updateCategory:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    const productCount = await Product.countDocuments({ category: req.params.id });
    if (productCount > 0) return res.status(400).json({ message: 'Cannot delete category with associated products' });
    await category.deleteOne();
    req.app.get('io').to('adminRoom').emit('categoryUpdate');
    res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error('Error in deleteCategory:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.updateCategoryItemCount = async (categoryId) => {
  try {
    const count = await Product.countDocuments({ category: categoryId });
    await Category.findByIdAndUpdate(categoryId, { itemCount: count });
  } catch (error) {
    console.error('Error updating category item count:', error);
  }
};