import { deleteOrder, readRecords, recordPayment, saveMenuItem, saveOrder } from './db.js?v=2';

const byId = id => document.getElementById(id);
const tabs = [...document.querySelectorAll('[data-view]')];
const periods = [...document.querySelectorAll('[data-period]')];
const itemDialog = byId('item-dialog');
const itemForm = byId('item-form');
const deleteDialog = byId('delete-dialog');
const newCart = new Map();
let cart = newCart;
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const timeZone = 'Asia/Kolkata';
const calendarDay = new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'short' });
const fullDate = new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'full' });
const timestamp = new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'medium', timeStyle: 'short' });
const sync = 'BroadcastChannel' in window ? new BroadcastChannel('petti-kada-records') : null;
let menu = [];
let orders = [];
let todayOnly = true;
let editingId = null;
let editingOrderId = null;
let deleteTarget = null;
let busy = false;
let writingItem = false;
let ready = false;

const money = paise => currency.format(paise / 100);
const orderName = id => 'Order #' + String(id).padStart(3, '0');

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function action(label, name, id, className = 'outline') {
  const button = element('button', label, className);
  button.type = 'button';
  button.dataset.action = name;
  if (id !== undefined) button.dataset.id = id;
  return button;
}

function empty(title, details, symbol = '▤') {
  const node = element('div', undefined, 'empty');
  const icon = element('span', symbol, 'symbol');
  icon.setAttribute('aria-hidden', 'true');
  node.append(icon, element('strong', title), element('span', details));
  return node;
}

function showStatus(id, message = '') {
  const node = byId(id);
  node.textContent = message;
  node.hidden = !message;
}

function selectView(view) {
  for (const tab of tabs) {
    const current = tab.dataset.view === view;
    tab.setAttribute('aria-current', String(current));
    byId('view-' + tab.dataset.view).hidden = !current;
  }
}

function renderSales() {
  const now = Date.now();
  const today = calendarDay.format(now);
  const paid = orders.filter(order => order.payment && (!todayOnly || calendarDay.format(order.payment.at) === today));
  const totals = { Cash: 0, UPI: 0 };
  for (const order of paid) totals[order.payment.method] += order.total;
  const pending = orders.filter(order => !order.payment).length;
  byId('date').textContent = fullDate.format(now);
  byId('total').textContent = money(totals.Cash + totals.UPI);
  byId('cash').textContent = money(totals.Cash);
  byId('upi').textContent = money(totals.UPI);
  byId('pending').textContent = pending;
  byId('pending-tab').textContent = pending;
  return paid;
}

function renderMenu() {
  const cards = menu.map(item => {
    const card = action('', 'increase', item.id, 'menu-item');
    const price = element('span', money(item.price));
    const plus = element('b', '+');
    plus.setAttribute('aria-hidden', 'true');
    price.append(plus);
    card.setAttribute('aria-label', 'Add ' + item.name + ' to order, ' + money(item.price));
    card.append(element('strong', item.name), price);
    return card;
  });
  byId('order-menu').replaceChildren(...(cards.length ? cards : [empty('Your menu is empty', 'Add your first item to start taking orders.')]));

  const rows = menu.map(item => {
    const row = element('div', undefined, 'menu-row');
    const left = element('div');
    left.append(element('strong', item.name), element('div', money(item.price)));
    const edit = action('Edit', 'edit-item', item.id);
    edit.setAttribute('aria-label', 'Edit ' + item.name);
    row.append(left, edit);
    return row;
  });
  byId('manage-list').replaceChildren(...(rows.length ? rows : [empty('Your menu is empty', 'Add items and their prices here.')]));
}

function renderCart() {
  const lines = [...cart.values()];
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  byId('quantity').textContent = quantity + (quantity === 1 ? ' item' : ' items');
  byId('cart-total').textContent = money(total);
  byId('save-order').disabled = !lines.length || busy;
  byId('save-order').textContent = editingOrderId === null ? 'Save order' : 'Save changes';
  byId('cart-heading').textContent = editingOrderId === null ? 'Current order' : 'Edit ' + orderName(editingOrderId);
  byId('cancel-edit').hidden = editingOrderId === null;
  const rows = lines.map(line => {
    const row = element('div', undefined, 'cart-line');
    const label = element('div');
    label.append(element('strong', line.name), element('small', money(line.price * line.quantity)));
    const stepper = element('div', undefined, 'stepper');
    const minus = action('−', 'decrease', line.id);
    const plus = action('+', 'increase', line.id);
    minus.setAttribute('aria-label', 'Remove one ' + line.name);
    plus.setAttribute('aria-label', 'Add one ' + line.name);
    stepper.append(minus, element('span', line.quantity), plus);
    row.append(label, stepper);
    return row;
  });
  byId('cart-lines').replaceChildren(...(rows.length ? rows : [empty('No items yet', 'Select an item from the menu.', '＋')]));
}

function orderCard(order) {
  const card = element('article', undefined, 'record');
  const summary = element('div');
  const lines = element('ul');
  for (const line of order.lines) {
    lines.append(element('li', line.quantity + ' × ' + line.name + ' · ' + money(line.price * line.quantity)));
  }
  summary.append(element('h3', orderName(order.id)), element('small', timestamp.format(order.createdAt)), lines);
  const end = element('div', undefined, 'record-end');
  end.append(element('strong', money(order.total)));
  if (order.payment) {
    end.append(element('span', order.payment.method, 'method'), element('small', 'Paid ' + timestamp.format(order.payment.at)));
  } else {
    const actions = element('div', undefined, 'payment-actions');
    actions.append(action('Mark paid by Cash', 'pay-cash', order.id), action('Mark paid by UPI', 'pay-upi', order.id));
    end.append(actions);
  }
  const controls = element('div', undefined, 'order-actions');
  if (!order.payment) controls.append(action('Edit order', 'edit-order', order.id));
  controls.append(action('Delete order', 'ask-delete', order.id, 'outline danger'));
  end.append(controls);
  card.append(summary, end);
  return card;
}

function renderOrders() {
  const paid = renderSales().sort((first, second) => second.payment.at - first.payment.at || second.id - first.id);
  const pending = orders.filter(order => !order.payment).sort((first, second) => first.id - second.id);
  byId('awaiting-list').replaceChildren(...(pending.length ? pending.map(orderCard) : [empty('No orders awaiting payment', 'Saved orders appear here until payment is recorded.', '◷')]));
  const paidDetails = todayOnly ? 'Payments recorded today appear here.' : 'Recorded payments appear here.';
  byId('paid-list').replaceChildren(...(paid.length ? paid.map(orderCard) : [empty('No paid orders', paidDetails, '✓')]));
}

async function refresh() {
  ({ menu, orders } = await readRecords());
  for (const item of menu) {
    const line = newCart.get(item.id);
    if (line) newCart.set(item.id, { ...item, quantity: line.quantity });
  }
  ready = true;
  renderMenu();
  renderCart();
  renderOrders();
}

function storageError() {
  showStatus('error', 'Could not access saved data. Check that browser storage is available and try again.');
}

function openItem(item) {
  itemForm.reset();
  editingId = item?.id ?? null;
  byId('item-heading').textContent = item ? 'Edit menu item' : 'Add menu item';
  byId('item-name').value = item?.name ?? '';
  byId('item-price').value = item ? (item.price / 100).toFixed(2) : '';
  showStatus('form-error');
  itemDialog.showModal();
  byId('item-name').focus();
}

itemForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (writingItem) return;
  const name = byId('item-name').value.trim();
  const input = byId('item-price').value.trim();
  const [rupees, fraction = ''] = input.split('.');
  const price = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  if (!name || !/^\d+(\.\d{1,2})?$/.test(input) || !Number.isSafeInteger(price) || price <= 0) {
    showStatus('form-error', 'Enter an item name and a price above ₹0 with up to two decimal places.');
    return;
  }
  const item = { name, price };
  if (editingId !== null) item.id = editingId;
  writingItem = true;
  byId('save-item').disabled = true;
  try {
    await saveMenuItem(item);
    itemDialog.close();
    sync?.postMessage('changed');
    showStatus('notice', item.id ? 'Menu item updated.' : 'Menu item added.');
    await refresh();
    const target = document.querySelector(item.id ? '[data-action="edit-item"][data-id="' + item.id + '"]' : '#order-menu button');
    if (target && target.offsetWidth) target.focus();
  } catch (error) {
    console.error(error);
    if (itemDialog.open) showStatus('form-error', 'The item could not be saved. Try again.');
    else storageError();
  } finally {
    writingItem = false;
    byId('save-item').disabled = false;
  }
});

function openOrderEditor(order) {
  if (editingOrderId !== order.id) {
    editingOrderId = order.id;
    cart = new Map(order.lines.map(line => [line.id, { ...line }]));
  }
  showStatus('notice');
  selectView('new');
  renderCart();
  const heading = byId('cart-heading');
  heading.tabIndex = -1;
  heading.focus();
}

function closeOrderEditor() {
  editingOrderId = null;
  cart = newCart;
  selectView('awaiting');
  renderCart();
}

function askDelete(order) {
  deleteTarget = { id: order.id, wasPaid: Boolean(order.payment) };
  const effect = order.payment ? ' It will also remove ' + money(order.total) + ' from ' + order.payment.method + ' sales.' : '';
  byId('delete-heading').textContent = 'Delete ' + orderName(order.id) + '?';
  byId('delete-description').textContent = 'This permanently deletes the order.' + effect;
  showStatus('delete-error');
  deleteDialog.showModal();
}

deleteDialog.addEventListener('cancel', event => {
  if (byId('confirm-delete').disabled) event.preventDefault();
});

byId('delete-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !deleteTarget) return;
  const { id, wasPaid } = deleteTarget;
  const confirm = byId('confirm-delete');
  busy = true;
  confirm.disabled = true;
  showStatus('delete-error');
  try {
    if (!await deleteOrder(id, wasPaid)) {
      showStatus('delete-error', 'This order changed or was deleted. Close this dialog and check the order list.');
      await refresh();
      return;
    }
    if (editingOrderId === id) closeOrderEditor();
    deleteDialog.close();
    sync?.postMessage('changed');
    showStatus('notice', orderName(id) + ' deleted.');
    await refresh();
    tabs.find(tab => tab.getAttribute('aria-current') === 'true')?.focus();
  } catch (error) {
    console.error(error);
    if (deleteDialog.open) showStatus('delete-error', 'Could not delete the order. Try again.');
    else storageError();
  } finally {
    busy = false;
    confirm.disabled = false;
    byId('save-order').disabled = !cart.size;
  }
});

async function updateOrder(name, id) {
  if (busy || (name === 'save-order' && !cart.size)) return;
  busy = true;
  byId('save-order').disabled = true;
  try {
    if (name === 'save-order') {
      const order = await saveOrder([...cart.values()], editingOrderId);
      if (editingOrderId !== null) {
        const editedId = editingOrderId;
        closeOrderEditor();
        if (order) showStatus('notice', orderName(order.id) + ' updated.');
        else showStatus('error', orderName(editedId) + ' is no longer awaiting payment. Your changes were discarded.');
      } else {
        cart.clear();
        selectView('awaiting');
        showStatus('notice', orderName(order.id) + ' saved. Record payment after receiving it.');
      }
    } else {
      const method = name === 'pay-cash' ? 'Cash' : 'UPI';
      const order = await recordPayment(id, method);
      showStatus('notice', order ? orderName(id) + ' marked paid by ' + method + '.' : orderName(id) + ' is already paid.');
    }
    sync?.postMessage('changed');
    await refresh();
    const selected = tabs.find(tab => tab.getAttribute('aria-current') === 'true');
    selected?.focus();
  } catch (error) {
    console.error(error);
    storageError();
  } finally {
    busy = false;
    byId('save-order').disabled = !cart.size;
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const { view, period, action: name } = button.dataset;
  const id = Number(button.dataset.id);
  if (view) {
    selectView(view);
    showStatus('notice');
  }
  if (period) {
    todayOnly = period === 'today';
    for (const control of periods) control.setAttribute('aria-pressed', String(control === button));
    renderOrders();
  }
  if (name === 'close-item' && !writingItem) itemDialog.close();
  if (name === 'cancel-delete' && !byId('confirm-delete').disabled) deleteDialog.close();
  if (!name || !ready) return;
  showStatus('error');
  if (name === 'add-item') openItem();
  if (name === 'edit-item') openItem(menu.find(item => item.id === id));
  if (name === 'edit-order' && !busy) {
    const order = orders.find(entry => entry.id === id);
    if (order && !order.payment) openOrderEditor(order);
  }
  if (name === 'cancel-edit' && !busy) {
    closeOrderEditor();
    tabs.find(tab => tab.dataset.view === 'awaiting')?.focus();
  }
  if (name === 'ask-delete' && !busy) {
    const order = orders.find(entry => entry.id === id);
    if (order) askDelete(order);
  }
  if ((name === 'increase' || name === 'decrease') && !busy) {
    const item = cart.get(id) ?? menu.find(entry => entry.id === id);
    if (!item) return;
    const quantity = (item.quantity ?? 0) + (name === 'increase' ? 1 : -1);
    if (quantity > 0) cart.set(id, { ...item, quantity });
    else cart.delete(id);
    renderCart();
    if (!button.isConnected) {
      const replacement = byId('cart-lines').querySelector('[data-action="' + name + '"][data-id="' + id + '"]');
      (replacement ?? byId('order-menu').querySelector('[data-id="' + id + '"]'))?.focus();
    }
  }
  if (name === 'save-order' || name === 'pay-cash' || name === 'pay-upi') void updateOrder(name, id);
});

function updateConnection() {
  byId('connection').textContent = navigator.onLine ? 'On this device' : 'Offline · on this device';
}

window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
window.addEventListener('focus', () => { void refresh().catch(storageError); });
if (sync) sync.onmessage = () => { void refresh().catch(storageError); };
setInterval(() => {
  if (byId('date').textContent !== fullDate.format(Date.now())) renderOrders();
}, 30000);
updateConnection();
renderOrders();
void refresh().catch(storageError);

if ('serviceWorker' in navigator && !document.querySelector('meta[name="petti-protected"]')) {
  navigator.serviceWorker.register('./sw.js').catch(error => {
    console.error(error);
    showStatus('error', 'Offline setup could not complete. Reload while online to try again.');
  });
}
