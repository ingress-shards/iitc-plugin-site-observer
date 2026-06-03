import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const { fileURLToPath } = require('url');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webpack = require('webpack');
const { merge } = require('webpack-merge');

const baseDevConfig = require('iitcpluginkit/config/webpack.dev.js');

export default merge(baseDevConfig, {
    context: path.resolve(__dirname),
    resolve: {
        symlinks: true,
        alias: {
            'temporal-polyfill': path.resolve(__dirname, 'node_modules/temporal-polyfill')
        }
    },
    mode: 'development',
    devtool: 'eval-cheap-module-source-map',
    cache: {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename],
        },
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                enforce: "pre",
                use: ["source-map-loader"],
            },
        ],
    },
    output: {
        devtoolModuleFilenameTemplate: 'file:///[resource-path]'
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.APP_ENV': JSON.stringify('dev'),
            'process.env.DATABASE_NAME': JSON.stringify('iitc_site-observer-dev'),
            'process.env.PLUGIN_ICON': JSON.stringify(require('./plugin.json').icon),
        })
    ],
    ignoreWarnings: [/Failed to parse source map/],
});
