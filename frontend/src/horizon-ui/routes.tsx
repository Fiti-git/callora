import React from 'react';
import {
  MdHome,
  MdCampaign,
  MdPeople,
  MdContacts,
  MdTimeline,
  MdTask,
  MdEventNote,
  MdBarChart,
  MdPhone,
  MdBlock,
  MdCreditCard,
  MdSettings,
} from 'react-icons/md';

const routes = [
  {
    name: 'Dashboard',
    layout: '',
    path: '/dashboard',
    icon: <MdHome className="h-6 w-6" />,
  },
  {
    name: 'Campaigns',
    layout: '',
    path: '/campaigns',
    icon: <MdCampaign className="h-6 w-6" />,
  },
  {
    name: 'Leads',
    layout: '',
    path: '/leads',
    icon: <MdPeople className="h-6 w-6" />,
  },
  {
    name: 'Contacts',
    layout: '',
    path: '/contacts',
    icon: <MdContacts className="h-6 w-6" />,
  },
  {
    name: 'Pipeline',
    layout: '',
    path: '/pipeline',
    icon: <MdTimeline className="h-6 w-6" />,
  },
  {
    name: 'Tasks',
    layout: '',
    path: '/tasks',
    icon: <MdTask className="h-6 w-6" />,
  },
  {
    name: 'Follow-ups',
    layout: '',
    path: '/follow-ups',
    icon: <MdEventNote className="h-6 w-6" />,
  },
  {
    name: 'Analytics',
    layout: '',
    path: '/analytics',
    icon: <MdBarChart className="h-6 w-6" />,
  },
  {
    name: 'Demo Call',
    layout: '',
    path: '/demo',
    icon: <MdPhone className="h-6 w-6" />,
  },
  {
    name: 'Blacklist',
    layout: '',
    path: '/blacklist',
    icon: <MdBlock className="h-6 w-6" />,
  },
  {
    name: 'Billing',
    layout: '',
    path: '/billing',
    icon: <MdCreditCard className="h-6 w-6" />,
  },
  {
    name: 'Settings',
    layout: '',
    path: '/settings',
    icon: <MdSettings className="h-6 w-6" />,
  },
];

export default routes;
