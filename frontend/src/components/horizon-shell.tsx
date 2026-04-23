'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/horizon-ui/components/sidebar';
import Navbar from '@/horizon-ui/components/navbar';
import Footer from '@/horizon-ui/components/footer/Footer';
import routes from '@/horizon-ui/routes';
import { getActiveRoute, getActiveNavbar } from '@/horizon-ui/utils/navigation';

export default function HorizonShell({
  children,
  userName,
  userEmail,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
}) {
  const [open, setOpen] = useState(true);
  const [hovered, setHovered] = useState(false);
  const pathname = usePathname() || '';

  // Sidebar visually expanded if explicitly open OR hovered while collapsed
  const expanded = open || hovered;

  return (
    <div className="min-h-screen bg-background-100 dark:bg-background-900">
      <div
        onMouseEnter={() => !open && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Sidebar
          routes={routes as any}
          open={expanded}
          setOpen={setOpen}
          userName={userName}
          userEmail={userEmail}
        />
      </div>
      <div
        className={
          'flex min-h-screen flex-col font-dm transition-[margin-left] duration-300 dark:bg-navy-900 ' +
          (open ? 'ml-[300px]' : 'ml-[88px]')
        }
      >
        <div className="px-2.5 pt-2 md:pr-2">
          <Navbar
            onOpenSidenav={() => {
              setOpen(!open);
              setHovered(false);
            }}
            brandText={getActiveRoute(routes as any, pathname)}
            secondary={getActiveNavbar(routes as any, pathname)}
            userName={userName}
            userEmail={userEmail}
          />
        </div>
        <main className="mx-auto w-full flex-1 p-2 !pt-[10px] md:p-2">
          {children}
        </main>
        <div className="p-3">
          <Footer />
        </div>
      </div>
    </div>
  );
}
