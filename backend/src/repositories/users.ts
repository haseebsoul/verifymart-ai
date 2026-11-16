import type { Collection } from 'mongodb';
import { getAtlasDb } from '../infrastructure/atlas.js';
import type { Role, UserDocument } from './contracts.js';

export class MongoUserRepository {
  private users(): Collection<UserDocument> {
    return getAtlasDb().collection<UserDocument>('users');
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.users().findOne({ _id: id });
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.users().findOne({ email: email.trim().toLowerCase() });
  }

  async setRole(id: string, role: Role): Promise<boolean> {
    const result = await this.users().updateOne({ _id: id }, { $set: { role } });
    return result.modifiedCount === 1;
  }

  async incrementFailedLogin(id: string, now = new Date()): Promise<number> {
    const result = await this.users().findOneAndUpdate(
      { _id: id },
      [{ $set: { failedLogins: { $add: [{ $ifNull: ['$failedLogins', 0] }, 1] } } }],
      { returnDocument: 'after' }
    );
    if (!result) return 0;
    const failures = result.failedLogins;
    if (failures >= 5) {
      await this.users().updateOne(
        { _id: id },
        { $set: { failedLogins: 0, lockedUntil: new Date(now.getTime() + 5 * 60 * 1000) } }
      );
      return 5;
    }
    return failures;
  }

  async clearFailedLogins(id: string, at = new Date()): Promise<void> {
    await this.users().updateOne(
      { _id: id },
      { $set: { failedLogins: 0, lockedUntil: null, lastLogin: at } }
    );
  }
}
