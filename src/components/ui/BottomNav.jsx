import React from 'react';
import { NavLink } from 'react-router-dom';
import { Heart, House, MapPin, ShoppingBag, User } from 'lucide-react';

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

export function BottomNav() {
  return (
    <nav className="ui-bottomNav" aria-label="Навигация">
      <div className="ui-bottomNavInner">
        <Tab to="/" label="Главная" icon={House} />
        <Tab to="/favorites" label="Сохранено" icon={Heart} />
        <Tab to="/recipients" label="Адреса" icon={MapPin} />
        <Tab to="/catalog" label="Каталог" icon={ShoppingBag} />
        <Tab to="/account" label="Профиль" icon={User} />
      </div>
    </nav>
  );
}
