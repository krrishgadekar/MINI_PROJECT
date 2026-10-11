process.env.MONGOMS_MD5_CHECK = '0';
process.env.MONGOMS_DISABLE_POSTINSTALL = '1';

import { MongoMemoryServer } from 'mongodb-memory-server';

export const createMemoryServer = async (): Promise<MongoMemoryServer> => {
  return MongoMemoryServer.create({
    binary: { version: '7.0.14' },
  });
};
