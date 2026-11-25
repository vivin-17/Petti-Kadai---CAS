const opened = new Promise((resolve, reject) => {
  const request = indexedDB.open('petti-kada', 1);
  request.onupgradeneeded = () => {
    const database = request.result;
    database.createObjectStore('menu', { keyPath: 'id', autoIncrement: true });
    database.createObjectStore('orders', { keyPath: 'id', autoIncrement: true });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function transact(stores, mode, work) {
  const database = await opened;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(stores, mode);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error ?? new Error('Storage transaction aborted.'));
    try {
      work(transaction, value => { result = value; });
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

export function readRecords() {
  return transact(['menu', 'orders'], 'readonly', (transaction, done) => {
    const menu = transaction.objectStore('menu').getAll();
    const orders = transaction.objectStore('orders').getAll();
    orders.onsuccess = () => done({ menu: menu.result, orders: orders.result });
  });
}

export function saveMenuItem(item) {
  return transact(['menu'], 'readwrite', (transaction, done) => {
    const request = transaction.objectStore('menu').put(item);
    request.onsuccess = () => done(request.result);
  });
}

export function saveOrder(lines, id = null) {
  return transact(['orders'], 'readwrite', (transaction, done) => {
    const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    if (!lines.length || !Number.isSafeInteger(total) || total <= 0) {
      throw new Error('Invalid order total.');
    }
    const orders = transaction.objectStore('orders');
    if (id === null) {
      const order = { lines, total, createdAt: Date.now(), payment: null };
      const request = orders.add(order);
      request.onsuccess = () => done({ ...order, id: request.result });
      return;
    }
    const request = orders.get(id);
    request.onsuccess = () => {
      const order = request.result;
      if (!order || order.payment) return;
      const updated = { ...order, lines, total };
      orders.put(updated);
      done(updated);
    };
  });
}

export function deleteOrder(id, wasPaid) {
  return transact(['orders'], 'readwrite', (transaction, done) => {
    const orders = transaction.objectStore('orders');
    const request = orders.get(id);
    request.onsuccess = () => {
      const order = request.result;
      if (!order || Boolean(order.payment) !== wasPaid) return;
      orders.delete(id);
      done(true);
    };
  });
}

export function recordPayment(id, method) {
  if (method !== 'Cash' && method !== 'UPI') throw new Error('Invalid payment method.');
  return transact(['orders'], 'readwrite', (transaction, done) => {
    const orders = transaction.objectStore('orders');
    const request = orders.get(id);
    request.onsuccess = () => {
      const order = request.result;
      if (!order || order.payment) return;
      order.payment = { method, at: Date.now() };
      orders.put(order);
      done(order);
    };
  });
}
