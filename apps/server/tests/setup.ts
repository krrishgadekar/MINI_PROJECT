process.env.MONGOMS_MD5_CHECK = '0';
process.env.MONGOMS_DISABLE_POSTINSTALL = '1';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_jwt_access_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_jwt_refresh_secret';

import { MongoMemoryServer } from 'mongodb-memory-server';

export const createMemoryServer = async (): Promise<MongoMemoryServer> => {
  return MongoMemoryServer.create({
    binary: { version: '7.0.14' },
  });
};
