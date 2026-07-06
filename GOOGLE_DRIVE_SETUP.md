# Google Drive Integration Setup

To upload files to Google Drive instead of your local project directory, follow these steps:

## 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one

## 2. Enable Google Drive API

1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Google Drive API" and enable it

## 3. Create a Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Give it a name (e.g., "tambako-media-uploader")
4. Grant it the "Editor" role for Google Drive access
5. Click "Done"

## 4. Generate Service Account Key

1. In the Credentials page, find your service account
2. Click on it, then go to the "Keys" tab
3. Click "Add Key" > "Create new key" > "JSON"
4. Download the JSON file - this contains your credentials

## 5. Create a Google Drive Folder in a Shared Drive

1. Go to [Google Drive](https://drive.google.com/)
2. Create a shared drive or use an existing shared drive
3. Create a new folder inside that shared drive for your media uploads (e.g., "Tambako Media")
4. Right-click the folder > "Share"
5. Share with the service account email (from the JSON file)
6. Give it "Editor" permissions

> Service accounts do not have normal Drive storage quota, so the upload must target a folder inside a shared drive.

## 6. Update Environment Variables

Update your `.env` file with the credentials from the service account JSON:

```env
GOOGLE_DRIVE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour Private Key Here\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_FOLDER_ID=your-google-drive-folder-id
```

- `GOOGLE_DRIVE_CLIENT_EMAIL`: The `client_email` from the JSON file
- `GOOGLE_DRIVE_PRIVATE_KEY`: The `private_key` from the JSON file (keep the quotes and \n for line breaks)
- `GOOGLE_DRIVE_FOLDER_ID`: Get this from the URL when you open the shared folder in Google Drive

> Important: With a service account, the upload folder must live inside a shared drive. The service account must have Editor access to that shared drive folder.

## 7. Test the Upload

After setting up the credentials, try uploading a file through your content provider interface. The files should now be uploaded to Google Drive instead of your local directory.

## Notes

- Files uploaded to Google Drive are made publicly accessible so they can be viewed by your application users
- The folder ID should be the ID of the folder you created and shared with the service account
- Make sure the service account has edit permissions on the folder