declare const process: {
    env: {
        APP_ENV: string;
        DATABASE_NAME: string;
        CONFIG_BASE_URL: string;
        [key: string]: string | undefined;
    };
};

declare const VERSION: string;
