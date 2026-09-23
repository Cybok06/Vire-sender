from uuid import UUID

from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request
from pymongo.errors import OperationFailure, PyMongoError

from services.admin_sms_service import adjust_customer_sms, customer_sms_report
from services.sms_credit_service import sms_credit_balance, update_low_credit_alert
from utils.auth import require_admin

admin_users_sms_bp = Blueprint("admin_users_sms", __name__, url_prefix="/api/admin/users-sms")


@admin_users_sms_bp.get("")
@require_admin
def report(payload):
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        return {"success": False, "message": "Invalid page number."}, 400
    return jsonify(customer_sms_report(current_app.config["DB"], request.args.get("search", "").strip()[:200], page))


@admin_users_sms_bp.post("/<user_id>/adjust")
@require_admin
def adjust(payload, user_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return {"success": False, "message": "An adjustment is required."}, 400
    amount, action = data.get("amount"), data.get("type")
    reason = data.get("reason")
    if type(amount) is not int or not 1 <= amount <= 2147483647 or action not in ("credit", "debit"):
        return {"success": False, "message": "Choose add or deduct and enter a positive whole SMS amount."}, 400
    if not isinstance(reason, str) or not 1 <= len(reason.strip()) <= 500:
        return {"success": False, "message": "Enter a reason (1–500 characters)."}, 400
    try:
        object_id = ObjectId(user_id)
        request_id = str(UUID(str(data.get("request_id", ""))))
    except Exception:
        return {"success": False, "message": "Invalid user or adjustment request ID."}, 400
    db = current_app.config["DB"]
    try:
        result = adjust_customer_sms(db, object_id, str(payload.get("user_id") or payload.get("sub")),
                                     action, amount, reason.strip(), request_id)
    except ValueError as exc:
        return {"success": False, "message": str(exc)}, 400
    except OperationFailure as exc:
        current_app.logger.exception("SMS adjustment transaction failed")
        if exc.code == 20:
            return {"success": False, "retry_same_request": False,
                    "message": "SMS adjustments require MongoDB replica-set transaction support. No adjustment was applied."}, 503
        return {"success": False, "message": "Could not confirm adjustment. Retry the same request."}, 503
    except PyMongoError:
        current_app.logger.exception("SMS adjustment database error")
        return {"success": False, "message": "Could not confirm adjustment. Retry the same request."}, 503
    try:
        update_low_credit_alert(db, object_id, sms_credit_balance(db, object_id))
    except Exception:
        current_app.logger.exception("SMS adjustment saved, but low-credit alert could not be updated")
    return jsonify({**result, "message": "SMS balance updated successfully."})
