'use client';
import React from 'react';
import Dropdown from 'components/dropdown';
import { FiAlignJustify } from 'react-icons/fi';
import { FiSearch } from 'react-icons/fi';
import { RiMoonFill, RiSunFill } from 'react-icons/ri';
import { signOut } from 'next-auth/react';

const Navbar = (props: {
  onOpenSidenav: () => void;
  brandText: string;
  secondary?: boolean | string;
  userName?: string;
  userEmail?: string;
  [x: string]: any;
}) => {
  const { onOpenSidenav, brandText, userName, userEmail } = props;
  const [darkmode, setDarkmode] = React.useState(false);

  React.useEffect(() => {
    setDarkmode(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleDarkmode = () => {
    const html = document.documentElement;
    if (darkmode) {
      html.classList.remove('dark');
      try { localStorage.setItem('theme', 'light'); } catch {}
      setDarkmode(false);
    } else {
      html.classList.add('dark');
      try { localStorage.setItem('theme', 'dark'); } catch {}
      setDarkmode(true);
    }
  };

  return (
    <nav className="sticky top-4 z-40 flex flex-row flex-wrap items-center justify-between rounded-xl bg-white/10 p-2 backdrop-blur-xl dark:bg-[#0b14374d]">
      <div className="ml-[6px]">
        <div className="h-6 w-[224px] pt-1">
          <span className="text-sm font-normal text-navy-700 dark:text-white">
            Callora
          </span>
          <span className="mx-1 text-sm text-navy-700 dark:text-white"> / </span>
          <span className="text-sm font-normal capitalize text-navy-700 dark:text-white">
            {brandText}
          </span>
        </div>
        <p className="shrink text-[33px] capitalize text-navy-700 dark:text-white">
          <span className="font-bold capitalize">{brandText}</span>
        </p>
      </div>

      <div className="relative mt-[3px] flex h-[61px] w-[355px] flex-grow items-center justify-around gap-2 rounded-full bg-white px-2 py-2 shadow-xl shadow-shadow-500 dark:!bg-navy-800 dark:shadow-none md:w-[365px] md:flex-grow-0 md:gap-1 xl:w-[365px] xl:gap-2">
        <div className="flex h-full items-center rounded-full bg-lightPrimary text-navy-700 dark:bg-navy-900 dark:text-white xl:w-[225px]">
          <p className="pl-3 pr-2 text-xl">
            <FiSearch className="h-4 w-4 text-gray-400 dark:text-white" />
          </p>
          <input
            type="text"
            placeholder="Search..."
            className="block h-full w-full rounded-full bg-lightPrimary text-sm font-medium text-navy-700 outline-none placeholder:!text-gray-400 dark:bg-navy-900 dark:text-white dark:placeholder:!text-white sm:w-fit"
          />
        </div>
        <span
          className="flex cursor-pointer text-xl text-gray-600 dark:text-white"
          onClick={onOpenSidenav}
          aria-label="Toggle sidebar"
        >
          <FiAlignJustify className="h-5 w-5" />
        </span>

        <div className="cursor-pointer text-gray-600" onClick={toggleDarkmode}>
          {darkmode ? (
            <RiSunFill className="h-4 w-4 text-gray-600 dark:text-white" />
          ) : (
            <RiMoonFill className="h-4 w-4 text-gray-600 dark:text-white" />
          )}
        </div>

        <Dropdown
          button={
            <div className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-gradient-to-b from-brandLinear to-brand-500 font-bold text-white">
              {(userName || 'U').charAt(0).toUpperCase()}
            </div>
          }
          classNames={'py-2 top-8 -left-[180px] w-max'}
        >
          <div className="flex w-56 flex-col justify-start rounded-[20px] bg-white bg-cover bg-no-repeat p-2 shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:text-white dark:shadow-none">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-bold text-navy-700 dark:text-white">
                {userName || 'User'}
              </p>
              {userEmail ? (
                <p className="truncate text-xs text-gray-600 dark:text-gray-400">
                  {userEmail}
                </p>
              ) : null}
            </div>
            <div className="h-px w-full bg-gray-200 dark:bg-white/20" />
            <a
              href="/settings"
              className="mt-2 block rounded-lg px-3 py-2 text-sm text-gray-800 hover:bg-gray-100 dark:text-white dark:hover:bg-navy-800"
            >
              Settings
            </a>
            <a
              href="/billing"
              className="block rounded-lg px-3 py-2 text-sm text-gray-800 hover:bg-gray-100 dark:text-white dark:hover:bg-navy-800"
            >
              Billing
            </a>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              Sign out
            </button>
          </div>
        </Dropdown>
      </div>
    </nav>
  );
};

export default Navbar;
