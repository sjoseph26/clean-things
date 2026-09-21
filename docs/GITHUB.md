# Add Clean Things v0.6.0 to GitHub

The source ZIP contains the repository files, including `.github/workflows/verify.yml` and `.gitignore`. Extract it before working. APKs, SDKs, signing keys, private configuration and dependency directories are excluded. A GitHub repository has not been created or pushed by this release process.

1. Sign in to GitHub and create an empty **private** repository named `clean-things`. Do not prepopulate a README when importing these files. Add your teammates as collaborators and give your assessor access as required.
2. In GitHub Desktop, choose **Add local repository** and select the extracted source folder; create a repository there if prompted. Set your own Git name/email. Review the changed-file list and commit with a truthful message such as `Import verified v0.6.0 repair candidate`.
3. Publish to the new private repository. Alternatively, use the terminal commands below with your actual repository URL.
4. Open **Actions** and inspect the verification run. This workflow was prepared and the equivalent local commands were run; a GitHub-hosted run is still pending.
5. Use issues and pull requests for new work. Link each evaluator finding to its fix, test and actual commit. Add APKs as release assets only after the release gates pass.

```bash
git init -b main
git add .
git status
git commit -m "Import verified v0.6.0 repair candidate"
git remote add origin https://github.com/YOUR-ACCOUNT/clean-things.git
git push -u origin main
```

Configure your own Git identity before committing if Git requests it. Sign in through GitHub Desktop or the credential manager; do not paste a token into a command, source file or chat. Keep the repository private until the team has confirmed publication rights for the logo, code and evaluation material. No new open-source licence is assigned by this package.

CI uses demo configuration and fictional data. It produces an APK with package `gy.cleanthings.app.qa`; its temporary signing certificate can differ between CI runs. Do not replace your original live signing key with a CI-generated QA key.

