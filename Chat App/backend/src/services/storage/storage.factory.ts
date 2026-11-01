import { IStorageService } from "./storage.interface";
import { LocalStorageService } from "./local.storage";

export class StorageFactory {
  private static instance: IStorageService;

  public static getStorage(): IStorageService {
    if (!StorageFactory.instance) {
      // Defaults to LocalStorageService for zero-dependency local development
      StorageFactory.instance = new LocalStorageService();
    }
    return StorageFactory.instance;
  }
}
