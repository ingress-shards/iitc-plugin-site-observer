import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import { merge } from 'webpack-merge';
import baseDevConfig from 'iitcpluginkit/config/webpack.dev.js';
import pluginJson from './plugin.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const corePath = path.resolve(__dirname, '../ingress-events-core');
const hasLocalCore = fs.existsSync(corePath);

const alias = {
    'temporal-polyfill': path.resolve(__dirname, 'node_modules/temporal-polyfill'),
    '@ingress-shards/ingress-events-core/conf/recent/season_manifest.json': '@ingress-shards/ingress-events-core/conf/season_manifest.json',
    '@ingress-shards/ingress-events-core/conf/recent/season_geocode.json': '@ingress-shards/ingress-events-core/conf/season_geocode.json',
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
    resolveLoader: {
        modules: ['node_modules', path.resolve(__dirname, 'node_modules/iitcpluginkit/node_modules')],
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
            'process.env.PLUGIN_ICON': JSON.stringify(pluginJson.icon),
        })
    ],
    ignoreWarnings: [/Failed to parse source map/],
});
