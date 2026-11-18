import { NavLink } from 'react-router-dom';
import { Boxes, MessageSquare, ReceiptRussianRuble, ShoppingBag, User } from 'lucide-react';

function Tab({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => (isActive ? 'ui-bottomNavLink ui-bottomNavLink--active' : 'ui-bottomNavLink')}
    >
      <Icon size={22} />
      <span className="ui-bottomNavLabel">{label}</span>
    </NavLink>
  );
}

export function AdminBottomNav({ role }) {
  const canManageCatalog = role === 'admin' || role === 'moderator';
  const canViewBusiness = role === 'admin';
  return (
    <nav className="ui-bottomNav" aria-label="Навигация админки">
      <div className="ui-bottomNavInner">
        <Tab to="/orders" label="Заказы" icon={ShoppingBag} />
        {canManageCatalog ? <Tab to="/products" label="Товары" icon={Boxes} /> : null}
        <Tab to="/chats" label="Чаты" icon={MessageSquare} />
        {canViewBusiness ? <Tab to="/cash" label="Бизнес" icon={ReceiptRussianRuble} /> : null}
        <Tab to="/profile" label="Профиль" icon={User} />
      </div>
    </nav>
  );
}
