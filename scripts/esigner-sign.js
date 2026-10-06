/**
 * electron-builder custom Windows sign hook (win.signtoolOptions.sign) that
 * signs binaries with SSL.com's cloud-based eSigner service via CodeSignTool.
 *
 * Requires:
 *   CODE_SIGN_TOOL_PATH - directory containing CodeSignTool.bat/.sh
 *   ES_USERNAME         - SSL.com account username
 *   ES_PASSWORD         - SSL.com account password
 *   ES_CREDENTIAL_ID    - signing credential id (SIGNING CREDENTIALS on the SSL.com dashboard)
 *   ES_TOTP_SECRET      - eSigner TOTP secret for automated signing
 *
 * If the ES_* variables are not set the hook is a no-op, so local and
 * unsigned CI builds work unchanged.
 *
 * CodeSignTool cannot overwrite its input file non-interactively, so each
 * file is signed into a temp directory and copied back over the original.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

exports.default = async function sign(configuration) {
    const { ES_USERNAME, ES_PASSWORD, ES_CREDENTIAL_ID, ES_TOTP_SECRET, CODE_SIGN_TOOL_PATH } = process.env;

    if (!ES_USERNAME || !ES_PASSWORD || !ES_CREDENTIAL_ID || !ES_TOTP_SECRET) {
        console.warn(`eSigner credentials not set, skipping code signing for: ${configuration.path}`);
        return;
    }

    if (!CODE_SIGN_TOOL_PATH) {
        throw new Error('ES_* credentials are set but CODE_SIGN_TOOL_PATH is not; cannot locate CodeSignTool');
    }

    const toolScript = process.platform === 'win32' ? 'CodeSignTool.bat' : 'CodeSignTool.sh';
    const tool = path.join(CODE_SIGN_TOOL_PATH, toolScript);

    if (!fs.existsSync(tool)) {
        throw new Error(`CodeSignTool not found at: ${tool}`);
    }

    const inputFile = path.resolve(configuration.path);
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esigner-'));

    const args = [
        'sign',
        `-credential_id="${ES_CREDENTIAL_ID}"`,
        `-username="${ES_USERNAME}"`,
        `-password="${ES_PASSWORD}"`,
        `-totp_secret="${ES_TOTP_SECRET}"`,
        `-input_file_path="${inputFile}"`,
        `-output_dir_path="${outputDir}"`
    ];

    console.log(`eSigner: signing ${inputFile}`);

    try {
        execSync(`"${tool}" ${args.join(' ')}`, {
            cwd: CODE_SIGN_TOOL_PATH,
            stdio: ['ignore', 'inherit', 'inherit'],
            windowsHide: true
        });

        const signedFile = path.join(outputDir, path.basename(inputFile));

        if (!fs.existsSync(signedFile)) {
            throw new Error(`CodeSignTool did not produce a signed file at: ${signedFile}`);
        }

        fs.copyFileSync(signedFile, inputFile);
    } finally {
        fs.rmSync(outputDir, { recursive: true, force: true });
    }
};
