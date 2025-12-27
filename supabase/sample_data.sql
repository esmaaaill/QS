-- Sample Data for Testing
-- Run this AFTER deploying the main schema

-- Insert sample hotels
INSERT INTO hotels (name, city, address, description) VALUES
('Laguna Shoreline Resort', 'Malibu', '123 Pacific Coast Highway', 'Luxury beachfront resort with stunning ocean views'),
('Skyline Signature', 'Dubai', '456 Sheikh Zayed Road', 'Premium 5-star hotel in the heart of Dubai'),
('Summit Chalet', 'Whistler', '789 Mountain Way', 'Cozy mountain retreat perfect for winter getaways');

-- Insert sample rooms
INSERT INTO rooms (hotel_id, name, capacity, price_per_night, currency)
SELECT 
  h.id,
  'Deluxe Suite',
  2,
  CASE 
    WHEN h.name = 'Laguna Shoreline Resort' THEN 260
    WHEN h.name = 'Skyline Signature' THEN 340
    WHEN h.name = 'Summit Chalet' THEN 210
  END,
  CASE 
    WHEN h.city = 'Dubai' THEN 'AED'
    ELSE 'USD'
  END
FROM hotels h;

-- Verify data
SELECT h.name as hotel, r.name as room, r.price_per_night, r.currency
FROM hotels h
JOIN rooms r ON r.hotel_id = h.id;
