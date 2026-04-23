const Footer = () => {
  return (
    <div className="flex w-full flex-col items-center justify-between px-1 pb-8 pt-3 lg:px-8 xl:flex-row">
      <p className="mb-4 text-center text-sm font-medium text-gray-600 sm:!mb-0 md:text-lg">
        <span className="mb-4 text-center text-sm text-gray-600 sm:!mb-0 md:text-base">
          ©{new Date().getFullYear()} Callora by Redot Global. All rights reserved.
        </span>
      </p>
      <div>
        <ul className="flex flex-wrap items-center gap-3 sm:flex-nowrap md:gap-10">
          <li>
            <a
              href="/privacy"
              className="text-base font-medium text-gray-600 hover:text-gray-600"
            >
              Privacy
            </a>
          </li>
          <li>
            <a
              href="/terms"
              className="text-base font-medium text-gray-600 hover:text-gray-600"
            >
              Terms
            </a>
          </li>
          <li>
            <a
              href="https://redot.global"
              target="_blank"
              rel="noreferrer"
              className="text-base font-medium text-gray-600 hover:text-gray-600"
            >
              Redot Global
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Footer;
