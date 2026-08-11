import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI as string;

export const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(MONGO_URI);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};
