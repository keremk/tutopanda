When you’re running a model and something goes wrong, Replicate’s API returns error codes to help you understand what happened. These codes start at 1000 and are always 4 digits long.

[](#understanding-error-codes)Understanding error codes
-------------------------------------------------------

Error codes are returned in the format `E####` (for example, `E1001`). Each code corresponds to a specific type of error that can help you troubleshoot issues with your predictions.

[](#common-error-codes)Common error codes
-----------------------------------------

### [](#e1000---unknown-error)E1000 - Unknown Error

An unexpected error occurred that we haven’t categorized yet. This can happen due to temporary system issues, network connectivity problems, or unforeseen edge cases that we haven’t encountered before.

Try retrying your prediction, and check your internet connection. If the problem persists, [contact support](https://replicate.com/support).

### [](#e1001---model-out-of-memory-oom-killed)E1001 - Model Out of Memory (OOM Killed)

The model ran out of memory and was terminated by the system. This typically occurs when your input is too large (like a high-resolution image or very long text), when the model requires more memory than what’s available, or when complex operations exceed memory limits.

Try reducing the size of your input by using smaller images or shorter text. You can also try a different model variant with lower memory requirements, split large inputs into smaller chunks, or check the model’s documentation for input size limits.

### [](#e4875---internal-webhook-url-empty)E4875 - Internal Webhook URL Empty

A webhook URL was expected but not provided or is empty. This usually means you’re missing webhook configuration, have an empty webhook URL in your request, or the webhook URL was cleared or removed from your setup.

Make sure you’re providing a valid webhook URL in your prediction request, check that your webhook endpoint is accessible, and verify your webhook configuration is correct.

### [](#e6716---timeout-starting-prediction)E6716 - Timeout Starting Prediction

The prediction failed to start within the expected time limit. This can happen due to high system load, model initialization taking too long, resource allocation delays, or network connectivity issues.

Wait a moment and retry your prediction, check if there are any ongoing system issues, or try during off-peak hours if the problem persists.

### [](#e8367---prediction-stopped-in-non-terminal-state)E8367 - Prediction Stopped in Non-Terminal State

The prediction was stopped while it was still running, not in a completed or failed state. This usually occurs due to manual cancellation of the prediction, system maintenance or updates, resource reallocation, or timeout limits being exceeded.

Check if you or your application cancelled the prediction, retry the prediction if it wasn’t intentionally stopped, or monitor for any scheduled maintenance windows.

### [](#e8765---model-health-check-failed)E8765 - Model Health Check Failed

The model failed its health check before starting the prediction. This can be caused by model container issues, corrupted model files, environment configuration problems, or model version incompatibilities.

Try using a different model version, check if the model is experiencing known issues, wait a few minutes and retry, or contact support if the issue persists.

### [](#e9243---error-starting-prediction)E9243 - Error Starting Prediction

The prediction encountered an error during the startup process. This typically happens due to invalid input parameters, model configuration issues, resource allocation failures, or environment setup problems.

Verify your input parameters are correct, check the model’s documentation for required inputs, ensure all required environment variables are set, or try with simpler inputs first.

### [](#e9825---failed-to-upload-file)E9825 - Failed to Upload File

A file upload to Replicate failed during the prediction process. This can occur when the file is too large, there are network connectivity issues, the file format is invalid, the upload times out, or your storage quota has been exceeded.

Check your file size (most models have upload limits), ensure the file format is supported, try uploading the file again, compress or resize the file if possible, or check your internet connection.

[](#getting-help)Getting help
-----------------------------

If you’re encountering an error code not listed here, or if the suggested solutions don’t resolve your issue:

1.  Check our status page for any ongoing system issues
2.  Review the model documentation for specific requirements and limitations
3.  [Contact our support team](https://replicate.com/support)