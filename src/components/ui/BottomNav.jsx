import React from 'react';
import { NavLink } from 'react-router-dom';
import { Heart, House, ShoppingBag, User, Users } from 'lucide-react';

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
    <nav className="ui-bottomNav" aria-label="Navigation">
      <div className="ui-bottomNavInner">
        <Tab to="/" label="Home" icon={House} />
        <Tab to="/favorites" label="Saved" icon={Heart} />
        <Tab to="/recipients" label="Profiles" icon={Users} />
        <Tab to="/catalog" label="Shop" icon={ShoppingBag} />
        <Tab to="/account" label="Account" icon={User} />
      </div>
    </nav>
  );
}
