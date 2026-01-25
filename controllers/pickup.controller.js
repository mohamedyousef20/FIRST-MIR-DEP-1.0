import PickupPoint from '../models/pickupPoint.model.js';
import asyncHandler from 'express-async-handler';

export const createPickupPoint = asyncHandler(async (req, res) => {
  const { stationName, location, address, phone, workingHours, status } = req.body;

  const pickupPoint = new PickupPoint({
    stationName,
    location,
    address,
    phone,
    workingHours,
    status: status || 'active'
  });

  await pickupPoint.save();
  res.status(201).json(pickupPoint);
});

export const getPickupPoints = asyncHandler(async (req, res) => {
  const pickupPoints = await PickupPoint.find();
  res.json(pickupPoints);
});

export const updatePickupPoint = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { stationName, location, address, phone, workingHours, status } = req.body;

  const updatedPickupPoint = await PickupPoint.findByIdAndUpdate(
    id,
    {
      stationName,
      location,
      address,
      phone,
      workingHours,
      status,
      updatedAt: Date.now()
    },
    { new: true }
  );

  if (!updatedPickupPoint) {
    res.status(404);
    throw new Error('Pickup point not found');
  }

  res.json(updatedPickupPoint);
});

export const deletePickupPoint = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deletedPickupPoint = await PickupPoint.findByIdAndDelete(id);

  if (!deletedPickupPoint) {
    res.status(404);
    throw new Error('Pickup point not found');
  }

  res.json({ message: 'Pickup point deleted successfully' });
}); 