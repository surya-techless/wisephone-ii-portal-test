import type { APIRoute } from "astro";

import { HTTP } from "@/lib/server/api.response";
import { successResponse, errorResponse } from "@/lib/server/api.response";
import validateBearerToken from "@/lib/server/authentication";
import { WisephoneIIPortalAPIError } from "@/lib/server/api.response";

import { sendSysProbe } from "@/libs/mqtt";
import { getSysprobeEMFPayload } from "@/libs/aws/cloudwatch/sysprobe/payloads";

// simple endpoint to process and propagate system probe beats
// it's backed by a bearer token to protect against random traffic on the internet
export const POST: APIRoute = async ({ request }) => {
  const awsEMFNamespace = "Sysprobe";
  const payload = { ...getSysprobeEMFPayload(awsEMFNamespace) };

  if (!validateBearerToken(request)) {
    return errorResponse("unauthorized", HTTP.UNAUTHORIZED);
  }

  try {  
    await sendSysProbe(payload);
    return successResponse("Ok", HTTP.OK);
  } catch (error) {
      if (error instanceof WisephoneIIPortalAPIError) {
        return errorResponse("Unauthorized", HTTP.UNAUTHORIZED);
      }

      return errorResponse("Internal Server Error", HTTP.INTERNAL_SERVER_ERROR);
  }
};
