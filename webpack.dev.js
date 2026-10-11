import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import { merge } from 'webpack-merge';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import baseDevConfig from 'iitcpluginkit/config/webpack.dev.js';
import pluginJson from './plugin.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const alias = {
    '@ingress-shards/ingress-events-core/conf/recent/season_manifest.json': '@ingress-shards/ingress-events-core/conf/season_manifest.json',
    '@ingress-shards/ingress-events-core/conf/recent/season_geocode.json': '@ingress-shards/ingress-events-core/conf/season_geocode.json',
};

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
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, 'src/images/site-observer-icon.svg'),
                    to: 'site-observer-icon.svg',
                },
            ],
        }),
        new webpack.DefinePlugin({
            'process.env.APP_ENV': JSON.stringify('dev'),
            'process.env.DATABASE_NAME': JSON.stringify('iitc_site-observer-dev'),
            'process.env.PLUGIN_ICON': JSON.stringify(pluginJson.icon),
        })
    ],
    ignoreWarnings: [/Failed to parse source map/],
});
