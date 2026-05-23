import spawnAsync from '@expo/spawn-async';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { getFingerprintHashFromCLIAsync } from './utils/CLIUtils';
import {
  createFingerprintAsync,
  createProjectHashAsync,
  diffFingerprintChangesAsync,
} from '../../src/Fingerprint';
import { normalizeOptionsAsync } from '../../src/Options';
import { getHashSourcesAsync } from '../../src/sourcer/Sourcer';
import { E2E_EXPO_PACKAGE_VERSION, E2E_TEMPLATE_SDK_VERSION } from './utils/constants';

jest.mock('../../src/ExpoConfigLoader', () => ({
  // Mock the getExpoConfigLoaderPath to use the built version rather than the typescript version from src
  getExpoConfigLoaderPath: jest.fn(() =>
    jest.requireActual('path').resolve(__dirname, '..', '..', 'build', 'ExpoConfigLoader.js')
  ),
}));

describe('managed project test', () => {
  jest.setTimeout(600000);
  const tmpDir = require('temp-dir');
  const projectName = 'fingerprint-e2e-managed';
  const projectRoot = path.join(tmpDir, projectName);
  let originalConfig: any;

  beforeAll(async () => {
    await fs.rm(projectRoot, { force: true, recursive: true });

    await spawnAsync(
      'bunx',
      ['create-expo-app', '-t', `blank@${E2E_TEMPLATE_SDK_VERSION}`, projectName],
      {
        stdio: 'inherit',
        cwd: tmpDir,
        env: {
          ...process.env,
          // Do not inherit the package manager from this repository
          npm_config_user_agent: undefined,
        },
      }
    );

    originalConfig = JSON.parse(await fs.readFile(path.join(projectRoot, 'app.json'), 'utf8'));
  });

  afterEach(async () => {
    await fs.writeFile(path.join(projectRoot, 'app.json'), JSON.stringify(originalConfig, null, 2));
  });

  afterAll(async () => {
    await fs.rm(projectRoot, { force: true, recursive: true });
  });

  it('should have same hash after adding js only library', async () => {
    const hash = await createProjectHashAsync(projectRoot);
    await spawnAsync('npx', ['expo', 'install', '@react-navigation/core'], {
      stdio: 'ignore',
      cwd: projectRoot,
    });
    const hash2 = await createProjectHashAsync(projectRoot);
    expect(hash).toBe(hash2);
  });

  it('should have same hash after updating js code', async () => {
    const hash = await createProjectHashAsync(projectRoot);
    const hashCLI = await getFingerprintHashFromCLIAsync(projectRoot);
    expect(hash).toEqual(hashCLI);

    const jsPath = path.join(projectRoot, 'App.js');
    const js = await fs.readFile(jsPath, 'utf8');
    await fs.writeFile(jsPath, `${js}\n// adding comments`);

    const hash2 = await createProjectHashAsync(projectRoot);
    const hash2CLI = await getFingerprintHashFromCLIAsync(projectRoot);
    expect(hash2).toEqual(hash2CLI);

    expect(hash).toBe(hash2);
  });

  it('should have different hash after adding native library', async () => {
    const hash = await createProjectHashAsync(projectRoot);
    const hashCLI = await getFingerprintHashFromCLIAsync(projectRoot);
    expect(hash).toEqual(hashCLI);

    await spawnAsync('npx', ['expo', 'install', 'expo-updates'], {
      stdio: 'ignore',
      cwd: projectRoot,
    });
    const hash2 = await createProjectHashAsync(projectRoot);
    const hash2CLI = await getFingerprintHashFromCLIAsync(projectRoot);
    expect(hash2).toEqual(hash2CLI);

    expect(hash).not.toBe(hash2);
  });

  it('should have different hash after updating `jsEngine`', async () => {
    const hash = await createProjectHashAsync(projectRoot);
    const hashCLI = await getFingerprintHashFromCLIAsync(projectRoot);
    expect(hash).toEqual(hashCLI);

    const configPath = path.join(projectRoot, 'app.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    config.expo.jsEngine = 'hermes';
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    const hash2 = await createProjectHashAsync(projectRoot);
    const hash2CLI = await getFingerprintHashFromCLIAsync(projectRoot);
    expect(hash2).toEqual(hash2CLI);

    expect(hash).not.toBe(hash2);
  });

  it('should have different hash after updating icon file', async () => {
    const hash = await createProjectHashAsync(projectRoot);
    const hashCLI = await getFingerprintHashFromCLIAsync(projectRoot);
    expect(hash).toEqual(hashCLI);

    const iconPath = path.join(projectRoot, 'assets', 'icon.png');
    await fs.writeFile(iconPath, '');

    const hash2 = await createProjectHashAsync(projectRoot);
    const hash2CLI = await getFingerprintHashFromCLIAsync(projectRoot);
    expect(hash2).toEqual(hash2CLI);

    expect(hash).not.toBe(hash2);
  });

  it('should have different hash after adding js only config-plugin', async () => {
    const hash = await createProjectHashAsync(projectRoot);
    const hashCLI = await getFingerprintHashFromCLIAsync(projectRoot);
    expect(hash).toEqual(hashCLI);

    await spawnAsync('npx', ['expo', 'install', 'expo-build-properties'], {
      stdio: 'ignore',
      cwd: projectRoot,
    });
    const hash2 = await createProjectHashAsync(projectRoot);
    const hash2CLI = await getFingerprintHashFromCLIAsync(projectRoot);
    expect(hash2).toEqual(hash2CLI);

    expect(hash).not.toBe(hash2);
  });

  it('diffFingerprintChangesAsync - should return diff after adding native library', async () => {
    const fingerprint = await createFingerprintAsync(projectRoot);
    await spawnAsync('bun', ['install', '--save', '@react-native-community/netinfo@12.0.1'], {
      stdio: 'ignore',
      cwd: projectRoot,
    });
    const diff = await diffFingerprintChangesAsync(fingerprint, projectRoot);
    expect(diff).toMatchInlineSnapshot(`
      [
        {
          "addedSource": {
            "filePath": "node_modules/@react-native-community/netinfo",
            "hash": "334cd6d4855e7a91245555dab588e11af60b44b8",
            "reasons": [
              "rncoreAutolinkingAndroid",
              "rncoreAutolinkingIos",
            ],
            "type": "dir",
          },
          "op": "added",
        },
        {
          "afterSource": {
            "contents": "{"@react-native-community/netinfo":{"root":"node_modules/@react-native-community/netinfo","name":"@react-native-community/netinfo","platforms":{"android":{"sourceDir":"node_modules/@react-native-community/netinfo/android","packageImportPath":"import com.reactnativecommunity.netinfo.NetInfoPackage;","packageInstance":"new NetInfoPackage()","buildTypes":[],"libraryName":"RNCNetInfoSpec","componentDescriptors":[],"cmakeListsPath":"node_modules/@react-native-community/netinfo/android/build/generated/source/codegen/jni/CMakeLists.txt","cxxModuleCMakeListsModuleName":null,"cxxModuleCMakeListsPath":null,"cxxModuleHeaderName":null,"isPureCxxDependency":false}}},"expo":{"root":"node_modules/expo","name":"expo","platforms":{"android":{"sourceDir":"node_modules/expo/android","packageImportPath":"import expo.modules.ExpoModulesPackage;","packageInstance":"new ExpoModulesPackage()","buildTypes":[],"componentDescriptors":[],"cmakeListsPath":"node_modules/expo/android/build/generated/source/codegen/jni/CMakeLists.txt","cxxModuleCMakeListsModuleName":null,"cxxModuleCMakeListsPath":null,"cxxModuleHeaderName":null,"isPureCxxDependency":false}}}}",
            "hash": "ad3ae18de8c44182090e89b14a35196677383997",
            "id": "rncoreAutolinkingConfig:android",
            "reasons": [
              "rncoreAutolinkingAndroid",
            ],
            "type": "contents",
          },
          "beforeSource": {
            "contents": "{"expo":{"root":"node_modules/expo","name":"expo","platforms":{"android":{"sourceDir":"node_modules/expo/android","packageImportPath":"import expo.modules.ExpoModulesPackage;","packageInstance":"new ExpoModulesPackage()","buildTypes":[],"componentDescriptors":[],"cmakeListsPath":"node_modules/expo/android/build/generated/source/codegen/jni/CMakeLists.txt","cxxModuleCMakeListsModuleName":null,"cxxModuleCMakeListsPath":null,"cxxModuleHeaderName":null,"isPureCxxDependency":false}}}}",
            "hash": "49cd30610fe5ca8a86eda4a42a13b2c00a7670df",
            "id": "rncoreAutolinkingConfig:android",
            "reasons": [
              "rncoreAutolinkingAndroid",
            ],
            "type": "contents",
          },
          "op": "changed",
        },
        {
          "afterSource": {
            "contents": "{"@react-native-community/netinfo":{"root":"node_modules/@react-native-community/netinfo","name":"@react-native-community/netinfo","platforms":{"ios":{"podspecPath":"node_modules/@react-native-community/netinfo/react-native-netinfo.podspec","version":"12.0.1","configurations":[],"scriptPhases":[]}}},"expo":{"root":"node_modules/expo","name":"expo","platforms":{"ios":{"podspecPath":"node_modules/expo/Expo.podspec","version":"56.0.3","configurations":[],"scriptPhases":[]}}}}",
            "hash": "7f61fd3f340abfae4a6534698f89c5f1bd7a7968",
            "id": "rncoreAutolinkingConfig:ios",
            "reasons": [
              "rncoreAutolinkingIos",
            ],
            "type": "contents",
          },
          "beforeSource": {
            "contents": "{"expo":{"root":"node_modules/expo","name":"expo","platforms":{"ios":{"podspecPath":"node_modules/expo/Expo.podspec","version":"56.0.3","configurations":[],"scriptPhases":[]}}}}",
            "hash": "0df97914029acd411c13509ac5fce5686722f2a4",
            "id": "rncoreAutolinkingConfig:ios",
            "reasons": [
              "rncoreAutolinkingIos",
            ],
            "type": "contents",
          },
          "op": "changed",
        },
      ]
    `);
  });

  it('should have same hash even if google service file path is different', async () => {
    const configPath = path.join(projectRoot, 'app.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    const googleServicesPath = path.join(projectRoot, 'google-services.json');
    config.expo.android.googleServicesFile = googleServicesPath;
    await fs.writeFile(googleServicesPath, '{}');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    const hash = await createProjectHashAsync(projectRoot);

    // Simulate the EAS environment secrets file path
    const tmpDir = require('temp-dir');
    const googleServicesPathNew = path.join(tmpDir, 'eas-environment-secrets', randomUUID());
    try {
      await fs.mkdir(path.dirname(googleServicesPathNew), { recursive: true });
      await fs.cp(googleServicesPath, googleServicesPathNew, { recursive: true });
      await fs.rm(googleServicesPath, { recursive: true, force: true });
      config.expo.android.googleServicesFile = googleServicesPathNew;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      const hash2 = await createProjectHashAsync(projectRoot);
      expect(hash).toBe(hash2);
    } finally {
      await fs.rm(path.dirname(googleServicesPathNew), { recursive: true, force: true });
    }
  });
});

describe(`getHashSourcesAsync - managed project`, () => {
  jest.setTimeout(600000);
  const tmpDir = require('temp-dir');
  const projectName = 'fingerprint-e2e-managed';
  const projectRoot = path.join(tmpDir, projectName);

  beforeAll(async () => {
    await fs.rm(projectRoot, { force: true, recursive: true });

    await spawnAsync(
      'bunx',
      ['create-expo-app', '-t', `blank@${E2E_TEMPLATE_SDK_VERSION}`, projectName],
      {
        stdio: 'inherit',
        cwd: tmpDir,
        env: {
          ...process.env,
          // Do not inherit the package manager from this repository
          npm_config_user_agent: undefined,
        },
      }
    );

    await spawnAsync('bun', ['install', '--save', `expo@${E2E_EXPO_PACKAGE_VERSION}`], {
      stdio: 'ignore',
      cwd: projectRoot,
    });
  });

  afterAll(async () => {
    await fs.rm(projectRoot, { force: true, recursive: true });
  });

  it('should match snapshot', async () => {
    const sources = await getHashSourcesAsync(
      projectRoot,
      await normalizeOptionsAsync(projectRoot)
    );
    expect(sources).toMatchSnapshot();
  });
});
