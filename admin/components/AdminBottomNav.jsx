import React from 'react';
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

export function AdminBottomNav() {
  return (
    <nav className="ui-bottomNav" aria-label="Навигация админки">
      <div className="ui-bottomNavInner">
        <Tab to="/orders" label="Заказы" icon={ShoppingBag} />
        <Tab to="/products" label="Товары" icon={Boxes} />
        <Tab to="/chats" label="Чаты" icon={MessageSquare} />
        <Tab to="/cash" label="Бизнес" icon={ReceiptRussianRuble} />
        <Tab to="/profile" label="Профиль" icon={User} />
      </div>
    </nav>
  );
}
