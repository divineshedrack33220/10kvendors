const Address = require('../models/Address');
const mongoose = require('mongoose');

exports.getAddresses = async (req, res) => {
  try {
    console.log('Fetching addresses for user:', req.user._id);
    const addresses = await Address.find({ user: req.user._id });
    res.json(addresses);
  } catch (error) {
    console.error('Error in getAddresses:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.getAddressById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log('Invalid address ID:', id);
      return res.status(400).json({ message: 'Invalid address ID' });
    }
    console.log('Fetching address ID:', id);
    const address = await Address.findOne({ _id: id, user: req.user._id });
    if (!address) {
      console.log('Address not found for ID:', id);
      return res.status(404).json({ message: 'Address not found' });
    }
    console.log('Fetched address:', address); // Log full address object
    res.json(address);
  } catch (error) {
    console.error('Error in getAddressById:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.addAddress = async (req, res) => {
  try {
    const { label, street, city, state, country, phone, isDefault } = req.body;

    // Validate inputs
    if (!label || !street || !city || !state || !country || !phone) {
      console.log('Validation failed:', { label, street, city, state, country, phone });
      return res.status(400).json({ message: 'All fields (label, street, city, state, country, phone) are required' });
    }
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phone)) {
      console.log('Invalid phone number:', phone);
      return res.status(400).json({ message: 'Invalid phone number format (e.g., +2341234567890)' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
      console.log('Invalid user ID:', req.user._id);
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    console.log('Adding address for user:', req.user._id, { label, street, city, state, country, phone, isDefault });
    const address = new Address({
      user: req.user._id,
      label: label.trim(),
      street: street.trim(),
      city: city.trim(),
      state: state.trim(),
      country: country.trim(),
      phone: phone.trim(),
      isDefault: !!isDefault,
    });

    // If setting as default, unset other default addresses
    if (isDefault) {
      console.log('Unsetting other default addresses for user:', req.user._id);
      await Address.updateMany(
        { user: req.user._id, isDefault: true },
        { isDefault: false }
      );
    }

    await address.save();
    console.log('Address saved successfully:', address);
    res.status(201).json(address);
  } catch (error) {
    console.error('Error in addAddress:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, street, city, state, country, phone, isDefault } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log('Invalid address ID:', id);
      return res.status(400).json({ message: 'Invalid address ID' });
    }
    if (!label || !street || !city || !state || !country || !phone) {
      console.log('Validation failed:', { label, street, city, state, country, phone });
      return res.status(400).json({ message: 'All fields (label, street, city, state, country, phone) are required' });
    }
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phone)) {
      console.log('Invalid phone number:', phone);
      return res.status(400).json({ message: 'Invalid phone number format (e.g., +2341234567890)' });
    }

    console.log('Updating address ID:', id, { label, street, city, state, country, phone, isDefault });
    const address = await Address.findOne({ _id: id, user: req.user._id });

    if (!address) {
      console.log('Address not found for ID:', id);
      return res.status(404).json({ message: 'Address not found' });
    }

    address.label = label.trim();
    address.street = street.trim();
    address.city = city.trim();
    address.state = state.trim();
    address.country = country.trim();
    address.phone = phone.trim();
    if (isDefault !== undefined) {
      if (isDefault) {
        console.log('Unsetting other default addresses for user:', req.user._id);
        await Address.updateMany(
          { user: req.user._id, isDefault: true },
          { isDefault: false }
        );
      }
      address.isDefault = !!isDefault;
    }

    await address.save();
    console.log('Address updated successfully:', address);
    res.json(address);
  } catch (error) {
    console.error('Error in updateAddress:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log('Invalid address ID:', id);
      return res.status(400).json({ message: 'Invalid address ID' });
    }
    console.log('Deleting address ID:', id);
    const address = await Address.findOneAndDelete({ _id: id, user: req.user._id });

    if (!address) {
      console.log('Address not found for ID:', id);
      return res.status(404).json({ message: 'Address not found' });
    }

    console.log('Address deleted successfully:', id);
    res.json({ message: 'Address deleted successfully' });
  } catch (error) {
    console.error('Error in deleteAddress:', error);
    res.status(400).json({ message: error.message });
  }
};