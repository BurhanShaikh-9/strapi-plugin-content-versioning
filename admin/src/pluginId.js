import pluginPkg from '../../package.json';

const pluginId = pluginPkg.strapi?.name || pluginPkg.name.replace(/^(@[^\/]+\/)?strapi-plugin-/i, '');

export default pluginId;
