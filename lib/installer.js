"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const tc = __importStar(require("@actions/tool-cache"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const restm = __importStar(require("typed-rest-client/RestClient"));
const semver = __importStar(require("semver"));
const IS_WINDOWS = process.platform === 'win32';
const IS_DARWIN = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';
const storageUrl = 'https://storage.googleapis.com/flutter_infra/releases';
let tempDirectory = process.env['RUNNER_TEMP'] || '';
if (!tempDirectory) {
    let baseLocation;
    if (IS_WINDOWS) {
        baseLocation = process.env['USERPROFILE'] || 'C:\\';
    }
    else {
        if (process.platform === 'darwin') {
            baseLocation = '/Users';
        }
        else {
            baseLocation = '/home';
        }
    }
    tempDirectory = path.join(baseLocation, 'actions', 'temp');
}
function getFlutter(version, channel) {
    return __awaiter(this, void 0, void 0, function* () {
        const versionPart = version.split('.');
        if (versionPart[1] == null || versionPart[2] == null) {
            version = version.concat('.x');
        }
        version = yield determineVersion(version, channel);
        let cleanver = `${version.replace('+', '-')}-${channel}`;
        let toolPath = tc.find('flutter', cleanver);
        if (toolPath) {
            core.debug(`Tool found in cache ${toolPath}`);
        }
        else {
            core.debug('Downloading Flutter from Google storage');
            const downloadInfo = getDownloadInfo(version, channel);
            const sdkFile = yield tc.downloadTool(downloadInfo.url);
            let tempDir = generateTempDir();
            const sdkDir = yield extractDownload(sdkFile, tempDir);
            core.debug(`Flutter sdk extracted to ${sdkDir}`);
            toolPath = yield tc.cacheDir(sdkDir, 'flutter', cleanver);
        }
        core.exportVariable('FLUTTER_HOME', toolPath);
        core.addPath(path.join(toolPath, 'bin'));
    });
}
exports.getFlutter = getFlutter;
function osName() {
    if (IS_DARWIN)
        return 'macos';
    if (IS_WINDOWS)
        return 'windows';
    return process.platform;
}
function extName() {
    if (IS_LINUX)
        return 'tar.xz';
    return 'zip';
}
function getDownloadInfo(version, channel) {
    const os = osName();
    const ext = extName();
    const url = `${storageUrl}/${channel}/${os}/flutter_${os}_v${version}-${channel}.${ext}`;
    return {
        version,
        url
    };
}
function generateTempDir() {
    return path.join(tempDirectory, 'temp_' + Math.floor(Math.random() * 2000000000));
}
function extractDownload(sdkFile, destDir) {
    return __awaiter(this, void 0, void 0, function* () {
        yield io.mkdirP(destDir);
        const sdkPath = path.normalize(sdkFile);
        const stats = fs.statSync(sdkPath);
        if (stats.isFile()) {
            yield extractFile(sdkFile, destDir);
            const sdkDir = path.join(destDir, fs.readdirSync(destDir)[0]);
            return sdkDir;
        }
        else {
            throw new Error(`Flutter sdk argument ${sdkFile} is not a file`);
        }
    });
}
function extractFile(file, destDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const stats = fs.statSync(file);
        if (!stats) {
            throw new Error(`Failed to extract ${file} - it doesn't exist`);
        }
        else if (stats.isDirectory()) {
            throw new Error(`Failed to extract ${file} - it is a directory`);
        }
        if ('tar.xz' === extName()) {
            yield tc.extractTar(file, destDir, 'x');
        }
        else {
            yield tc.extractZip(file, destDir);
        }
    });
}
function determineVersion(version, channel) {
    return __awaiter(this, void 0, void 0, function* () {
        if (version.endsWith('.x') || version === '') {
            return yield getLatestVersion(version, channel);
        }
        return version;
    });
}
function getLatestVersion(version, channel) {
    return __awaiter(this, void 0, void 0, function* () {
        const releasesUrl = `${storageUrl}/releases_${osName()}.json`;
        const rest = new restm.RestClient('flutter-action');
        const storage = (yield rest.get(releasesUrl)).result;
        if (!storage) {
            throw new Error('unable to get latest version');
        }
        if (version.endsWith('.x')) {
            const sver = version.slice(0, version.length - 2);
            const releases = storage.releases.filter(release => release.version.startsWith(`v${sver}`) && release.channel === channel);
            const versions = releases.map(release => release.version.slice(1, release.version.length));
            const sortedVersions = versions.sort(semver.rcompare);
            core.debug(`latest version of ${version} from channel ${channel} is ${sortedVersions[0]}`);
            return sortedVersions[0];
        }
        const channelVersion = storage.releases.find(release => release.hash === storage.current_release[channel]);
        if (!channelVersion) {
            throw new Error(`unable to get latest version from channel ${channel}`);
        }
        let cver = channelVersion.version;
        cver = cver.slice(1, cver.length);
        core.debug(`latest version from channel ${channel} is ${cver}`);
        return cver;
    });
}
