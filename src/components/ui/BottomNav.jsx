import React from 'react';
import { NavLink } from 'react-router-dom';
import { Heart, House, MessageCircle, User, Users } from 'lucide-react';

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
        <Tab to="/favorites" label="Избранное" icon={Heart} />
        <Tab to="/recipients" label="Люди" icon={Users} />
        <Tab to="/chat" label="Чат" icon={MessageCircle} />
        <Tab to="/account" label="Кабинет" icon={User} />
      </div>
    </nav>
  );
}
