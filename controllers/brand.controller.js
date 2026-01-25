import Product from "../models/product.model.js";
import Brand from "../models/brand.model.js";
import asyncHandler from "express-async-handler";

// Get all active brands
export const getBrands = asyncHandler(async (req, res) => {
  const brands = await Brand.find({ status: "active" }).sort({ createdAt: -1 });
  res.status(200).json(brands);
});

// Get brand by ID
export const getBrandById = asyncHandler(async (req, res) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) {
    res.status(404);
    throw new Error("Brand not found");
  }
  res.status(200).json(brand);
});

// Create brand
export const createBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.create(req.body);
  await brand.save();
  res.status(201).json(brand);
});

// Update brand
export const updateBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!brand) {
    res.status(404);
    throw new Error("Brand not found");
  }
  res.status(200).json(brand);
});

// Delete brand — if products still reference it block deletion unless ?force=true which cascades
export const deleteBrand = asyncHandler(async (req, res) => {
  const { force } = req.query;

  // Count products linked to this brand
  const linkedProductsCount = await Product.countDocuments({ brand: req.params.id });

  if (linkedProductsCount > 0 && force !== 'true') {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete brand while products reference it (use ?force=true to cascade)'
    });
  }

  // Cascade behaviour: unset brand from products before deleting
  if (linkedProductsCount > 0) {
    await Product.updateMany({ brand: req.params.id }, { $unset: { brand: 1 } });
  }

  const brand = await Brand.findByIdAndDelete(req.params.id);
  if (!brand) {
    res.status(404);
    throw new Error('Brand not found');
  }

  res.status(200).json({ success: true, message: 'Brand deleted successfully' });
});
