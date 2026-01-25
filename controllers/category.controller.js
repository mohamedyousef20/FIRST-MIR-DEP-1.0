import Product from "../models/product.model.js";
import Category from "../models/category.model.js";
import asyncHandler from 'express-async-handler';

// Get all categories
export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ status: "active" })
    .sort({ createdAt: -1 });

  res.status(200).json(categories);
});


// Get category by ID
export const getCategoryById = asyncHandler(async (req, res) => {

  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  res.status(200).json(category);
});

// Create category
export const createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create(req.body);
  await category.save();
  res.status(201).json(category);
});

// Update category
export const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  res.status(200).json(category);
});

// Delete category
export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  // Remove category reference from all products
  await Product.updateMany(
    { category: req.params.id },
    { $unset: { category: 1 } }
  );

  res.status(200).json({ message: 'Category deleted successfully' });
});