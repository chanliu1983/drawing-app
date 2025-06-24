// Browser-compatible storage service using IndexedDB
class DatabaseService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.dbName = 'CanvasDatabase';
    this.storeName = 'canvases';
  }

  async init() {
    if (this.isInitialized) return;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => {
        console.error('Failed to initialize database:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        console.log('Database initialized successfully');
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'name' });
        }
      };
    });
  }

  async saveCanvas(name, data) {
    if (!this.isInitialized) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const canvasData = {
        name,
        ...data,
        lastModified: new Date().toISOString()
      };
      
      const request = store.put(canvasData);
      
      request.onsuccess = () => {
        console.log(`Canvas '${name}' saved successfully`);
        resolve();
      };
      
      request.onerror = () => {
        console.error(`Failed to save canvas '${name}':`, request.error);
        reject(request.error);
      };
    });
  }

  async loadCanvas(name) {
    if (!this.isInitialized) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(name);
      
      request.onsuccess = () => {
        if (request.result) {
          console.log(`Canvas '${name}' loaded successfully`);
          const { name: canvasName, lastModified, ...data } = request.result;
          resolve(data);
        } else {
          console.log(`Canvas '${name}' not found`);
          resolve(null);
        }
      };
      
      request.onerror = () => {
        console.error(`Failed to load canvas '${name}':`, request.error);
        reject(request.error);
      };
    });
  }

  async getAllCanvasNames() {
    if (!this.isInitialized) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();
      
      request.onsuccess = () => {
        const names = request.result.sort();
        resolve(names);
      };
      
      request.onerror = () => {
        console.error('Failed to get canvas names:', request.error);
        reject(request.error);
      };
    });
  }

  async deleteCanvas(name) {
    if (!this.isInitialized) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(name);
      
      request.onsuccess = () => {
        console.log(`Canvas '${name}' deleted successfully`);
        resolve();
      };
      
      request.onerror = () => {
        console.error(`Failed to delete canvas '${name}':`, request.error);
        reject(request.error);
      };
    });
  }

  async canvasExists(name) {
    if (!this.isInitialized) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(name);
      
      request.onsuccess = () => {
        resolve(!!request.result);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

// Export a singleton instance
export default new DatabaseService();