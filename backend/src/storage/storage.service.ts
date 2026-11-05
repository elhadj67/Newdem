import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Stockage des pièces KYC. En dev : disque local privé (STORAGE_DIR).
 * En production : remplacer par un bucket S3/GCS PRIVÉ et servir les fichiers
 * via des URLs signées à durée limitée — jamais d'accès public direct.
 * Les fichiers ne sont jamais servis en statique ici : seule l'URL/clé est
 * conservée en base, l'accès passe par un endpoint protégé.
 */
@Injectable()
export class StorageService {
  private readonly dir = process.env.STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'kyc');

  async save(key: string, data: Buffer): Promise<string> {
    const full = path.join(this.dir, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    // Clé logique conservée en base ; résolue plus tard (URL signée en prod).
    return `kyc://${key}`;
  }

  async read(url: string): Promise<Buffer> {
    const key = url.replace(/^kyc:\/\//, '');
    return fs.readFile(path.join(this.dir, key));
  }
}
