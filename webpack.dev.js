import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const fs = require('fs');
const { fileURLToPath } = require('url');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webpack = require('webpack');
const { merge } = require('webpack-merge');

const baseDevConfig = require('iitcpluginkit/config/webpack.dev.js');

const corePath = path.resolve(__dirname, '../ingress-events-core');
const hasLocalCore = fs.existsSync(corePath);

const alias = {
    'temporal-polyfill': path.resolve(__dirname, 'node_modules/temporal-polyfill'),
};

if (hasLocalCore) {
    alias['@ingress-shards/ingress-events-core$'] = path.resolve(__dirname, '../ingress-events-core/dist/index.mjs');
    alias['@ingress-shards/ingress-events-core/conf'] = path.resolve(__dirname, '../ingress-events-core/dist/conf');
    alias['@ingress-shards/ingress-events-core/visuals'] = path.resolve(__dirname, '../ingress-events-core/dist/visuals');
}

export default merge(baseDevConfig, {
    context: path.resolve(__dirname),
    resolve: {
        symlinks: true,
        alias
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
