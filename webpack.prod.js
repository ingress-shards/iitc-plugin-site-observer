import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const { fileURLToPath } = require('url');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webpack = require('webpack');
const { merge } = require('webpack-merge');
const pkg = require('./package.json');

const baseProdConfig = require('iitcpluginkit/config/webpack.prod.js');

export default merge(baseProdConfig, {
    context: path.resolve(__dirname),
    resolve: {
        symlinks: false,
        alias: {
            'temporal-polyfill': path.resolve(__dirname, 'node_modules/temporal-polyfill')
        }
    },
    mode: 'production',
    devtool: false,
    optimization: {
        usedExports: true,
        sideEffects: true,
        minimize: true,
    },
    cache: {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename],
        },
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.APP_ENV': JSON.stringify('prod'),
            'process.env.DATABASE_NAME': JSON.stringify('iitc_site-observer'),
            'process.env.PLUGIN_ICON': JSON.stringify(require('./plugin.json').icon),
        })
    ],
});